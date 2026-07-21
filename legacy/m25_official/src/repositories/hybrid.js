export function createHybridRepository(localRepository, remoteRepository) {
  if (!localRepository) throw new Error('HybridRepository necesita repositorio local');
  if (!remoteRepository) throw new Error('HybridRepository necesita repositorio remoto');

  return {
    kind: `${localRepository.kind}+${remoteRepository.kind}`,
    authMode: remoteRepository.authMode || 'local-synthetic',
    local: localRepository,
    remote: remoteRepository,

    getState: (...args) => localRepository.getState(...args),
    setState: (...args) => localRepository.setState(...args),
    getAuth: (...args) => localRepository.getAuth(...args),
    setAuth: (...args) => localRepository.setAuth(...args),
    clearAuth: (...args) => localRepository.clearAuth(...args),
    listOutbox: (...args) => localRepository.listOutbox(...args),
    putOutbox: (...args) => localRepository.putOutbox(...args),
    removeOutbox: (...args) => localRepository.removeOutbox(...args),
    clearOutbox: (...args) => localRepository.clearOutbox(...args),
    listAudit: (...args) => localRepository.listAudit(...args),
    putAudit: (...args) => localRepository.putAudit(...args),
    clearAudit: (...args) => localRepository.clearAudit?.(...args),
    putDocument: (...args) => localRepository.putDocument(...args),
    listDocuments: (...args) => localRepository.listDocuments(...args),
    clearDocuments: (...args) => localRepository.clearDocuments?.(...args),

    loginRemote: (...args) => remoteRepository.login(...args),
    refreshRemote: (...args) => remoteRepository.refresh(...args),
    logoutRemote: (...args) => remoteRepository.logout(...args),
    requestPasswordRecoveryRemote: (...args) => remoteRepository.requestPasswordRecovery?.(...args),
    updatePasswordRemote: (...args) => remoteRepository.updatePassword?.(...args),
    bootstrapRemote: (...args) => remoteRepository.bootstrap(...args),
    reconcileRemote: (...args) => remoteRepository.reconcile(...args),
    createSignedDocumentUrl: (...args) => remoteRepository.createSignedDocumentUrl(...args),
    uploadDocumentRemote: (...args) => remoteRepository.uploadDocument(...args),
    saveDocumentMetadataRemote: (...args) => remoteRepository.saveDocumentMetadata(...args),
    createClientDraftRemote: (...args) => remoteRepository.createClientDraft?.(...args),
    searchExercisesRemote: (...args) => remoteRepository.searchExercises?.(...args),
    exerciseFacetsRemote: (...args) => remoteRepository.exerciseFacets?.(...args),
    invokeIberfitAiRemote: (...args) => remoteRepository.invokeIberfitAi?.(...args),
    catalogAdminRemote: (...args) => remoteRepository.catalogAdmin?.(...args),
    saveIriAssessmentRemote: (...args) => remoteRepository.saveIriAssessment(...args),
    saveIriReportsRemote: (...args) => remoteRepository.saveIriReports(...args),
    remoteHealth: (...args) => remoteRepository.health(...args),
    recordOperationalEventsRemote: (...args) => remoteRepository.recordOperationalEvents?.(...args),
    remoteOperationalHealth: (...args) => remoteRepository.operationalHealth?.(...args),
  };
}
