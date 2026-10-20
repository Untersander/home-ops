# Auth: Authelia + LLDAP

Single sign-on for the apps. [LLDAP](https://github.com/lldap/lldap) holds users and groups, [Authelia](https://www.authelia.com) is the login portal (password + TOTP/passkey) and OIDC provider.

| Component  | URL                       | Storage                                  |
| ---------- | ------------------------- | ---------------------------------------- |
| `authelia` | https://auth.k8s.garden   | SQLite on `authelia-data` (2FA devices, consents) |
| `lldap`    | https://ldap.k8s.garden   | SQLite on `lldap-data` (users, groups)   |
| `authelia-valkey` | –                  | in-memory sessions, survive Authelia restarts |

Both PVCs are backed up with kopiur and restored automatically when recreated (see [components](../../components/README.md)).

## Users and groups

People are created in the LLDAP UI (log in as `admin`). Groups:

| Group     | Access                                                         |
| --------- | -------------------------------------------------------------- |
| `admins`  | all apps, admin role in Grafana, Forgejo and Jellyfin          |
| `family`  | all apps as a normal user                                      |

Groups and the service accounts `authelia` (password manager, for password resets) and `jellyfin` (read-only bind) are declared in [lldap/bootstrap-configmap.yaml](./lldap/bootstrap-configmap.yaml) and applied by the bootstrap sidecar on every start.
Users log in to apps with two factors: password + TOTP or passkey. They register their devices at https://auth.k8s.garden (verification by email).

## Secrets (1Password, vault `Kubernetes`)

| Item (category) | Fields | Used for |
| --- | --- | --- |
| `Authelia` (Server) | `session-secret`, `storage-encryption-key`, `reset-password-jwt-secret`, `oidc-hmac-secret`, `oidc-jwks-key` (RSA private key PEM) | Authelia's own keys |
| `Authelia OIDC <client>` (API Credential), one per client | `credential` (plaintext, for the app), `digest` (for Authelia), `username` (client_id) | OIDC clients, created with `task authelia:client:secret CLIENT=<client>` |
| `Proton SMTP Token` (API Credential) | `username`, `credential` | Authelia's verification and password reset emails, sent as `contact@k8s.garden` |
| `LLDAP` (Login) | `username` `admin`, `password`, `jwt-secret`, `key-seed` | LLDAP admin (web UI and bootstrap) and LLDAP's own keys. Changing `key-seed` invalidates all passwords |
| `LLDAP authelia` (Login) | `username` `authelia`, `password` | Authelia's LDAP bind user (password manager, for password resets) |
| `LLDAP jellyfin` (Login) | `username` `jellyfin`, `password` | Jellyfin's read-only LDAP bind user |

Authelia only gets the client secret digests, the apps get the plaintext secret via their own ExternalSecret.

## Adding an OIDC client

The config is split into [authelia/config/configuration.yml](./authelia/config/configuration.yml) and [authelia/config/oidc-clients.yml](./authelia/config/oidc-clients.yml), merged by Authelia.
Look up redirect URI, scopes and auth method in Authelia's [integration guide](https://www.authelia.com/integration/openid-connect/clients/) for the app, then:

```bash
# Adds the client to oidc-clients.yml and its digest to authelia/es.yaml, then validates the config
task authelia:client:add CLIENT=forgejo NAME=Forgejo \
  REDIRECT_URIS=https://git.k8s.garden/user/oauth2/authelia/callback
# Optional: SCOPES=openid,profile,groups AUTH_METHOD=client_secret_post POLICY=family PKCE=false CLAIMS_POLICY=<name>

# Creates the API Credential "Authelia OIDC forgejo" in 1Password: credential (plaintext, for the app) and digest (for Authelia)
task authelia:client:secret CLIENT=forgejo
```

Then give the app the plaintext secret via an ExternalSecret in its namespace (the task prints an example).
Rotate a secret with `task authelia:client:secret CLIENT=<client> FORCE=true`.

`task authelia:validate` checks the config with dummy secrets (needs Docker), e.g. after editing the config by hand.

## Forward-auth (apps without OIDC)

Envoy asks Authelia before every request to a route that has a `SecurityPolicy` like the one below (Envoy ext_authz).
The `access_control` rules in [configuration.yml](./authelia/config/configuration.yml) decide who gets in (`*.k8s.garden` and `*.noreplay.org`: `admins` with two factors), the portal is https://auth.k8s.garden or https://auth.noreplay.org, matching the app's cookie domain.
The app's namespace has to be listed in [authelia/referencegrant.yaml](./authelia/referencegrant.yaml).

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: myapp
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: myapp
  extAuth:
    failOpen: false
    # Envoy only sends Host, Method, Path, Content-Length and Authorization by default;
    # Authelia needs the scheme (https) and its session cookie
    headersToExtAuth: ["Accept", "Authorization", "Proxy-Authorization", "Cookie", "X-Forwarded-Proto", "X-Forwarded-For"]
    http:
      backendRefs:
        - name: authelia
          namespace: auth
          port: 9091
      path: /api/authz/ext-authz/
      headersToBackend: ["Remote-User", "Remote-Groups", "Remote-Email", "Remote-Name"]
```

## Jellyfin (configured in the Jellyfin UI)

Plugin settings live on the `jellyfin-config` PVC, not in Git.

**LDAP-Auth** (official repository), so TV and mobile apps log in with the LLDAP password:

| Setting | Value |
| --- | --- |
| LDAP Server / Port | `lldap.auth.svc.cluster.local` / `3890`, Secure LDAP and StartTLS off |
| LDAP Bind User | `uid=jellyfin,ou=people,dc=k8s,dc=garden` |
| LDAP Bind User Password | `op read "op://Kubernetes/LLDAP jellyfin/password"` |
| LDAP Base DN for searches | `ou=people,dc=k8s,dc=garden` |
| LDAP Search Filter | `(\|(memberof=cn=family,ou=groups,dc=k8s,dc=garden)(memberof=cn=admins,ou=groups,dc=k8s,dc=garden))` |
| LDAP Search Attributes | `uid, mail` |
| LDAP Uid Attribute / LDAP Username Attribute | `uid` / `uid` |
| LDAP Admin Base DN | `ou=people,dc=k8s,dc=garden` |
| LDAP Admin Filter | `(memberof=cn=admins,ou=groups,dc=k8s,dc=garden)` |
| Enable User Creation | on |
| Allow Password Change | off (the bind user is read-only; passwords are changed in LLDAP or via Authelia's reset) |
