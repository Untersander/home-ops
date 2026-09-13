# Kustomize components

Components are added to an app's Flux Kustomization (`spec.components`, paths relative to `spec.path`) and configured with `spec.postBuild.substitute`.
They live outside `apps/` and `infra/` because Flux scans those directories and would treat a `kind: Component` as a normal kustomization.

## Backups: `backup-kopiur` and `backup-k8up`

Each tool has its own component, so an app can be backed up with kopiur, k8up or both.
Both write to the in-cluster Garage:

| Tool   | Repository                                                                             |
| ------ | -------------------------------------------------------------------------------------- |
| kopiur | `ClusterRepository garage` (bucket `kopiur-apps`, prefix `cluster/`)                    |
| k8up   | restic repository in bucket `k8up-apps` (endpoint/bucket set as k8up operator globals) |

Both are defined in `infra/backup/repositories` and `infra/backup/k8up`.

| Component       | Creates                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backup-kopiur` | SnapshotPolicies + SnapshotSchedules `${APP}` (CSI snapshot) and `${APP}-direct` (live volume), populator Restore `${APP}` for PVCs that restore automatically |
| `backup-k8up`   | k8up Schedule `${APP}`, GarageKey `${APP}-k8up`, ExternalSecret `${APP}-k8up-password`                                                                      |

The components create no PVCs. The app defines its PVCs itself, and nothing is backed up until a PVC carries the app label.

### Labels

| On        | Label                                   | Meaning                                                                                                                      |
| --------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Namespace | `backup.k8s.garden/enabled: "true"`     | Required for both. Allows the namespace to use the kopiur ClusterRepository and to create a Garage key for the k8up bucket    |
| PVC       | `backup.k8s.garden/app: <APP>`          | Back this PVC up with the app's components                                                                                   |
| PVC       | `backup.k8s.garden/copy-method: Direct` | kopiur only. Required for PVCs without CSI snapshots (`openebs-hostpath-*`, `local-storage`)                                   |
| PVC       | `k8up.io/backup: "false"`               | Skip k8up for this PVC. Needed on plain `openebs-zfs` (k8up can't mount it a second time); use `openebs-zfs-shared*` instead |

### Variables

| Variable               | Default           | Used by                                                            |
| ---------------------- | ----------------- | ------------------------------------------------------------------ |
| `APP`                  | required          | both: resource names, label value                                  |
| `BACKUP_UID`           | `1000`            | both: user of the movers, must be able to read the data            |
| `BACKUP_GID`           | `1000`            | both: group of the movers                                          |
| `BACKUP_SNAPSHOTCLASS` | `zfspv-snapclass` | `backup-kopiur`: CSI snapshots                                     |
| `BACKUP_KOPIUR_CRON`   | `H 1 * * *`       | `backup-kopiur`: schedules (`H` = stable random minute)            |
| `BACKUP_K8UP_SCHEDULE` | `30 3 * * *`      | `backup-k8up`: backup schedule, keep it outside the kopiur window  |

### Enable backups for an app

```yaml
# ns.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: myapp
  labels:
    backup.k8s.garden/enabled: "true"
---
# ks.yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: myapp
  namespace: myapp
spec:
  path: ./apps/myapp/app
  targetNamespace: myapp
  components: # pick one or both
    - ../../../components/backup-kopiur
    - ../../../components/backup-k8up
  # kopiur's webhook rejects policies while the ClusterRepository doesn't exist,
  # and an auto-restore PVC must not be created before the repository is there
  dependsOn:
    - name: backup-repositories
      namespace: backup
  postBuild:
    substitute:
      APP: myapp
  # sourceRef, prune, interval as usual
```

### New ZFS PVCs (auto-restore, needs `backup-kopiur`)

Any number of the app's ZFS PVCs can point at the same Restore; each is restored from its own backup path (`/pvc/<pvc-name>`).
When a PVC is created, it's filled from the latest kopiur backup, or starts empty if there is none.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: myapp-config
  labels:
    backup.k8s.garden/app: myapp
spec:
  storageClassName: openebs-zfs-shared-retain # ZFS (CSI) class; shared so k8up can mount it too
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  dataSourceRef:
    apiGroup: kopiur.home-operations.com
    kind: Restore
    name: myapp
```

### Existing or non-ZFS PVCs (manual restore)

Only label the PVCs:

```yaml
metadata:
  labels:
    backup.k8s.garden/app: myapp
    backup.k8s.garden/copy-method: Direct # hostpath / local-storage only
```

A `dataSourceRef` can't be added to an existing PVC, and non-CSI provisioners don't support populators, so these PVCs aren't restored automatically.
Direct backups read the live volume; databases can be caught mid-write.

### Restore manually

kopiur, from the latest backup (or `offset: 1`, `asOf: 2026-09-01T00:00:00Z`) into an existing PVC:

```yaml
apiVersion: kopiur.home-operations.com/v1alpha1
kind: Restore
metadata:
  name: myapp-restore
  namespace: myapp
spec:
  source:
    fromPolicy:
      name: myapp-direct # myapp for PVCs backed up via CSI snapshot
      sourcePath: /pvc/<pvc-name>
  target:
    pvcRef:
      name: <pvc-name> # scale the app down first, or restore into a new PVC and compare
  credentialProjection:
    enabled: true
  mover:
    securityContext: { runAsUser: 1000, runAsGroup: 1000 }
    podSecurityContext: { fsGroup: 1000 }
  policy:
    onMissingSnapshot: Fail
```

k8up, from a restic snapshot (`kubectl -n myapp get snapshots.k8up.io`):

```yaml
apiVersion: k8up.io/v1
kind: Restore
metadata:
  name: myapp-restore
  namespace: myapp
spec:
  snapshot: <snapshot-id>
  podSecurityContext: { runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000 }
  restoreMethod:
    folder:
      claimName: <pvc-name>
  backend:
    repoPasswordSecretRef: { name: myapp-k8up-password, key: password }
    s3:
      endpoint: http://garage-infra.object-storage.svc.cluster.local:3900
      bucket: k8up-apps
      accessKeyIDSecretRef: { name: myapp-k8up, key: access-key-id }
      secretAccessKeySecretRef: { name: myapp-k8up, key: secret-access-key }
```

Label restore target PVCs with `k8up.io/backup: "false"` (and without `backup.k8s.garden/app`) so they aren't backed up themselves.
