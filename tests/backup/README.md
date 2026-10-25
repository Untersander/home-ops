# Backup test

End-to-end test that kopiur backups can be restored, run on demand:

```sh
task backup:test
```

Nothing of it runs in the cluster between tests. The task creates the namespace `backup-test` with `components/backup-kopiur`, as a real app gets it
(`./kustomization.yaml`, rendered with `flux envsubst` and `APP=backup-test` instead of Flux), runs the steps below and deletes the namespace again.
After an aborted run, `task backup:test:cleanup` removes what is left.

| Step                   | What happens                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Write test data     | PVCs `backup-test-zfs` (ZFS) and `backup-test-hostpath` (hostpath) are created, a pod writes random files into both and prints their checksums |
| 2. Back up             | One kopiur Snapshot per PVC: CSI snapshot for ZFS, live (Direct) for hostpath                                                                   |
| 3. Delete pod and PVCs | The data is gone (both storage classes use the Delete reclaim policy)                                                                           |
| 4. Restore and compare | ZFS PVC recreated with `dataSourceRef` (auto-restore), hostpath PVC by a manual Restore; a pod prints the checksums of the restored files        |

The task ends with `OK: all files restored unchanged`, or `FAILED` and a non-zero exit code if a file is missing, extra or different.
The cleanup deletes the Snapshots first, which also removes them from the kopia repository.

The test uses the components from the working copy, so it can check a change to `components/backup-kopiur` before it is pushed.

## By hand

The same steps with kubectl, to see what happens in between (from the repository root):

```sh
kubectl kustomize tests/backup | APP=backup-test flux envsubst --strict | kubectl apply -f -

kubectl apply -f tests/backup/pvc.yaml -f tests/backup/write.yaml
kubectl -n backup-test logs -f pod/backup-test-write # note the checksums

kubectl create -f tests/backup/snapshot.yaml
kubectl -n backup-test get kopiasnap -w # wait for both to be Succeeded

kubectl -n backup-test delete pod backup-test-write
kubectl -n backup-test delete pod -l app.kubernetes.io/managed-by=kopiur --field-selector=status.phase==Succeeded
kubectl -n backup-test delete pvc backup-test-zfs backup-test-hostpath

kubectl apply -f tests/backup/restore.yaml
kubectl -n backup-test get kopiarestore -w # wait for backup-test-hostpath to be Completed
kubectl apply -f tests/backup/verify.yaml
kubectl -n backup-test logs -f pod/backup-test-verify # same checksums as above

task backup:test:cleanup
```
