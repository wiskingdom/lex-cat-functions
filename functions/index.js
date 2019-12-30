const functions = require('firebase-functions');

// subfunctions
const getEntryStage = (isEntry, pos, sem) => {
  if (!isEntry) {
    return 0;
  } else if (pos && sem) {
    return 3;
  } else {
    return 2;
  }
};
const getWorksetId = entryId => entryId.split('-').slice(0, 2).join('-');
const getSuperEntryId = entryId => entryId.split('-').slice(0, 3).join('-');

// common functions 
exports.onEntryUpdate = functions.database
  .ref('/dict/{domainName}/entries/{entryId}')
  .onUpdate((change, context) => {
    const { isEntry, pos, sem } = change.after.val();
    const bf = change.before.val();
    if (isEntry === bf.isEntry && pos === bf.pos && sem === bf.sem) {
      return null;
    }

    const { entryId } = context.params;
    const worksetId = getWorksetId(entryId);
    const stage = getEntryStage(isEntry, pos, sem);
    const updatedAt = Date.now();
    const stateRef = change.after.ref.parent.parent
      .child('entryStates').child(worksetId).child(entryId);

    stateRef.child('updatedAt').set(updatedAt);
    return stateRef.child('stage').set(stage);
  });

exports.onEntryStageUpdate = functions.database
  .ref('/dict/{domainName}/entryStates/{worksetId}/{entryId}/stage')
  .onUpdate((change, context) => {
    const { worksetId } = context.params;
    const worksetStateRef = change.after.ref.parent.parent.parent.parent
      .child('worksetStates').child(worksetId);
    return change.after.ref.parent.parent
      .orderByChild('stage').startAt(3).once('value', snap => {
        const cntComplete = snap.numChildren();
        console.log(cntComplete);
        worksetStateRef.child('cntComplete').set(cntComplete);
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
    stateRef.child('updatedAt').set(updatedAt);
    stateRef.child('hasSynset').set(Boolean(synset));

    if (synset && bfSynset) {
      synsetsRef.child(bfSynset).child(entryId).remove();
      return entryFreqRef.once('value', snap => {
        synsetsRef.child(synset).child(entryId).set(snap.val());
      });

    } else if (synset && !bfSynset) {
      return entryFreqRef.once('value', snap => {
        synsetsRef.child(synset).child(entryId).set(snap.val());
      });
    } else if (!synset && bfSynset) {
      return synsetsRef.child(bfSynset).child(entryId).remove();
    } else {
      return null;
    }

  });

exports.onSynsetDelete = functions.database
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