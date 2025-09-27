# Infra Services

The following infra services are installed via Flux:
- flux
- cilium
- kubelet-csr-approver
- cert-manager
- external-secret-operator
- kubevirt


## Flux Bootstrap
```bash
flux bootstrap git \
  --url=ssh://git@github.com/Untersander/home-ops.git \
  --branch=main \
  --path=infra
```

## Secret Management
Secrets are managed using [External Secrets](https://external-secrets.io/), which fetches secrets from 1Password.
All Kubernetes secrets are stored in the 1Password vault named `Kubernetes`, including the Service Account token called `Service Account Auth Token Kubernetes`, which is used to connect External Secrets Operator (ESO) with 1Password.
To connect, create a secret using the Service Account token with this template:
```bash
kubectl create secret generic onepasswordsecret -n external-secrets \
    --from-literal=token=$(op read "op://Kubernetes/Service Account Auth Token Kubernetes/credential")
```
If you don't have the 1Password CLI installed, you can also use the following command to create the secret:
```bash
kubectl create secret generic onepasswordsecret --from-literal=token=<yourTokenGoesHere_inPlaintext> --namespace=external-secrets
```