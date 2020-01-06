const functions = require('firebase-functions');

// subfunctions
const getEntryStage = (isSkipped, needCheck, pos, sem) => {
  if (needCheck) {
    return 1;
  } else if (!isSkipped && pos && sem) {
    return 3;
  } else if (isSkipped) {
    return 2;
  } else if (pos || sem) {
    return 1;
  } else {
    return 0;
  }
};
const getWorksetId = entryId => entryId.split('-').slice(0, 2).join('-');
const getSuperEntryId = entryId => entryId.split('-').slice(0, 3).join('-');

// common functions 
exports.onEntryUpdate = functions.database
  .ref('/dict/{domainName}/entries/{entryId}')
  .onUpdate((change, context) => {
    const { isSkipped, needCheck, pos, sem } = change.after.val();
    const bf = change.before.val();
    if (isSkipped === bf.isSkipped 
      && needCheck === bf.needCheck 
      && pos === bf.pos 
      && sem === bf.sem ) {
      return null;
    }
    const { entryId } = context.params;
    const worksetId = getWorksetId(entryId);
    const stage = getEntryStage(isSkipped, needCheck, pos, sem);
    const updatedAt = Date.now();
    const stateRef = change.after.ref.parent.parent
      .child('entryStates').child(worksetId).child(entryId);

    change.after.ref.child('updatedAt').set(updatedAt);
    return stateRef.child('stage').set(stage);
  });

exports.onEntryStageUpdate = functions.database
  .ref('/dict/{domainName}/entryStates/{worksetId}/{entryId}/stage')
  .onUpdate((change, context) => {
    const { worksetId } = context.params;
    const worksetStateRef = change.after.ref.parent.parent.parent.parent
      .child('worksetStates').child(worksetId);
    const worksetEntriesRef = change.after.ref.parent.parent;
    return worksetEntriesRef
      .orderByChild('stage').startAt(3).once('value', snap => {
        const cntCompletes = snap.numChildren();
        console.log(cntCompletes);
        worksetStateRef.child('cntCompletes').set(cntCompletes);
      });
  });

exports.onEntrySynsetUpdate = functions.database
  .ref('/dict/{domainName}/entries/{entryId}/synset')
  .onUpdate((change, context) => {
    const synset = change.after.val();
    const bfSynset = change.before.val();
    const { entryId } = context.params;
    const worksetId = getWorksetId(entryId);
    const superEntryId = getSuperEntryId(entryId);
    const stateRef = change.after.ref.parent.parent.parent
      .child('entryStates').child(worksetId).child(entryId);
    const synsetsRef = change.after.ref.parent.parent.parent
      .child('synsets');
    const entryFreqRef = change.after.ref.parent.parent.parent
      .child('superEntries').child(superEntryId).child('freq');
    const updatedAt = Date.now();
    change.after.ref.parent.child('updatedAt').set(updatedAt);
    stateRef.child('hasSynset').set(Boolean(synset));

    if (synset && bfSynset) {
      synsetsRef.child(bfSynset).child(entryId).remove();
      return entryFreqRef.once('value', freqSnap => {
        synsetsRef.child(synset).child(entryId).set(freqSnap.val());
      });

    } else if (synset && !bfSynset) {
      return entryFreqRef.once('value', freqSnap => {
        synsetsRef.child(synset).child(entryId).set(freqSnap.val());
      });
    } else if (!synset && bfSynset) {
      return synsetsRef.child(bfSynset).child(entryId).remove();
    } else {
      return null;
    }

  });

exports.onSynsetMemberDelete = functions.database
  .ref('/dict/{domainName}/synsets/{synsetId}/{memberId}')
  .onDelete((snapshot, context) => {
    const synsetRef = snapshot.ref.parent;
    const { synsetId } = context.params;
    return synsetRef.once('value', synSnap => {
      const synset = synSnap.val();
      if (!synset) {
        return null;
      } else {
        const members = Object.keys(synset);
        if (members.length === 1) {
          const theMemberId = members[0];
          return snapshot.ref.parent.parent.parent
            .child('entries').child(theMemberId).child('synset')
            .set('');
        } else if (!synset[synsetId]) {
          const newSynsetId = Object.entries(synset)
            .sort((a, b) => Number(b[1]) - Number(a[1]))[0][0];
          return members.forEach(member => {
            snapshot.ref.parent.parent.parent
              .child('entries').child(member).child('synset')
              .set(newSynsetId);
          });
        } else {
          return null;
        }
      }
    });
  });
