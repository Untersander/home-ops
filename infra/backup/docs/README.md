# Velero Usage
To create a backup of the 'demo' namespace, you can use the following command:
```bash
velero backup create demobackup \
  --include-namespaces demo \
  --snapshot-move-data  \
  --storage-location=aws \
  --wait
```

velero backup create immichtest1 \
  --include-namespaces immich \
  --snapshot-move-data \
  --storage-location garage \
  --volume-snapshot-locations garage \
  --include-resources persistentvolumeclaims,persitentvolumes \
  -n backup \
  --wait

velero schedule create immich \
  --include-namespaces immich \
  --snapshot-move-data \
  --storage-location garage \
  --volume-snapshot-locations garage \
  --include-resources persistentvolumeclaims,persitentvolumes \
  -n backup --schedule "0 4 * * *" --ttl 240h

To check the status of the backup, you can use the following command:
```bash
velero backup describe demobackup --details
velero backup logs demobackup
```

To restore the backup, you can use the following command:
```bash
velero restore create test6-restore --from-backup demobackup --wait
```

To access the files in the S3 storage, you can use the AWS CLI:
```bash
aws s3 ls s3://backup
```
or my alias with included credentials:
```bash
opagb s3 ls s3://backup/
```
Delete all backups:
```bash
velero delete backup --all
```