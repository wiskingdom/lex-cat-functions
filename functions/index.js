const functions = require('firebase-functions');

// subfunctions
const getWorksetId = entryId => entryId.split('-').slice(0, 2).join('-');

// common functions 
exports.onEntryMarkingStageUpdate = functions.database
  .ref('/dict/{domainName}/entryMarkings/{worksetId}/{entryId}/stage')
  .onUpdate((change, context) => {
    const { worksetId } = context.params;
    const stage = change.after.val();
    const bfStage = change.before.val();
    if (stage === bfStage) {
      return null;
    }
    const worksetRef = change.after.ref.parent.parent.parent.parent
      .child('worksets').child(worksetId);
    const worksetMarkingsRef = change.after.ref.parent.parent;
    return worksetMarkingsRef
      .orderByChild('stage').startAt(2).once('value', snap => {
        const cntCompletes = snap.numChildren();
        console.log(`${worksetId}: ${cntCompletes} entries complete!`)
        worksetRef.update({ cntCompletes });
      });
  });
exports.onEntryMarkingIssueProcessUpdate = functions.database
  .ref('/dict/{domainName}/entryMarkings/{worksetId}/{entryId}/issueProcess')
  .onUpdate((change, context) => {
    const { worksetId } = context.params;
    const issueProcess = change.after.val();
    const bfIssueProcess = change.before.val();
    if (issueProcess === bfIssueProcess) {
      return null;
    }
    const worksetRef = change.after.ref.parent.parent.parent.parent
      .child('worksets').child(worksetId);
    const worksetMarkingsRef = change.after.ref.parent.parent;
    return new Promise(resolve => {
      worksetMarkingsRef
      .orderByChild('issueProcess').equalTo(1).once('value', snap => {
        const cntOpenIssues = snap.numChildren();
        console.log(`${worksetId}: ${cntOpenIssues} issues open!`)
        worksetRef.update({ cntOpenIssues });
      });
      worksetMarkingsRef
      .orderByChild('issueProcess').equalTo(2).once('value', snap => {
        const cntRepliedIssues = snap.numChildren();
        console.log(`${worksetId}: ${cntRepliedIssues} issues open!`)
        worksetRef.update({ cntRepliedIssues });
      });
      worksetMarkingsRef
      .orderByChild('issueProcess').equalTo(3).once('value', snap => {
        const cntClosedIssues = snap.numChildren();
        console.log(`${worksetId}: ${cntClosedIssues} issues closed!`)
        worksetRef.update({ cntClosedIssues });
      });
      resolve();
    }); 
  });

exports.onEntrySynOfUpdate = functions.database
  .ref('/dict/{domainName}/entries/{entryId}/synOf')
  .onUpdate((change, context) => {
    const synOf = change.after.val();
    const bfSynOf = change.before.val();

    const { entryId } = context.params;
    const worksetId = getWorksetId(entryId);
    const entryRef = change.after.ref.parent;
    const entryMarkingRef = change.after.ref.parent.parent.parent
      .child('entryMarkings').child(worksetId).child(entryId);
    const synsetsRef = change.after.ref.parent.parent.parent
      .child('synsets');
    const updatedAt = Date.now();
    entryRef.update({ updatedAt });
    entryMarkingRef.update({ hasSynset: Boolean(synOf) });

    if (synOf && bfSynOf) {
      synsetsRef.child(bfSynOf).child(entryId).remove();
      return entryRef.child('orthForm').once('value', snap => {
        synsetsRef.child(synOf).child(entryId).set(snap.val());
      });

    } else if (synOf && !bfSynOf) {
      return entryRef.child('orthForm').once('value', snap => {
        synsetsRef.child(synOf).child(entryId).set(snap.val());
      });
    } else if (!synOf && bfSynOf) {
      return synsetsRef.child(bfSynOf).child(entryId).remove();
    } else {
      return null;
    }

  });

exports.onSynsetMemberDelete = functions.database
  .ref('/dict/{domainName}/synsets/{synsetId}/{memberId}')
  .onDelete((snapshot) => {
    const synsetRef = snapshot.ref.parent;
    return synsetRef.once('value', synSnap => {
      const synset = synSnap.val();
      if (!synset) {
        return null;
      } else {
        const members = Object.keys(synset);
        if (members.length === 1) {
          const theMemberId = members[0];
          return snapshot.ref.parent.parent.parent
            .child('entries').child(theMemberId).child('synOf')
            .set('');
        } else {
          return null;
        }
      }
    });
  });
