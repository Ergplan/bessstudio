# Running BESS Studio on the shared workstation VM

For the `tariff-order` VM in project `tariff-order-parsing`, alongside the tariff order studio.
**Nothing here touches that product**: separate checkout, separate compose project, separate port,
no shared volumes or networks, no firewall change, no Terraform.

| | |
| --- | --- |
| Checkout | `~/bessstudio` (never inside `~/tariff-oder`) |
| Compose project | `bessstudio` |
| Port | `127.0.0.1:8081` → container `:80` — **loopback only** |
| Volumes | none; the app is a static export with no state on disk |
| Google Cloud resources | none created |
| Reached by | SSH tunnel from your machine |

Ports 3000, 5432, 5433, 8000 and 22 are left alone.

## Before you start

Run these and check the output is what you expect:

```bash
df -h /                 # keep ≥20 GB free for the product's image builds
docker ps
docker compose ls
ss -ltnp                # confirm 8081 is free
gcloud auth list        # leave the identity as it is
gcloud config list
```

## Install

The repository is private, so it needs its own deploy key — **not** the tariff one.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_bessstudio -N ""
cat ~/.ssh/id_ed25519_bessstudio.pub     # add as a deploy key on Ergplan/bessstudio

cat >> ~/.ssh/config <<'EOF'

Host github.com-bessstudio
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_bessstudio
  IdentitiesOnly yes
EOF

git clone git@github.com-bessstudio:Ergplan/bessstudio.git ~/bessstudio
cd ~/bessstudio && git checkout claude/magical-thompson-id8qbv
```

## Run

```bash
cd ~/bessstudio
docker compose -p bessstudio up -d --build     # first run builds; a few minutes
docker compose -p bessstudio ps
curl -sI http://127.0.0.1:8081/ | head -1      # expect HTTP/1.1 200 OK
```

## Reach it

From your own machine, not the VM:

```bash
gcloud compute ssh tariff-order --zone asia-south2-b --project tariff-order-parsing \
  -- -N -L 8081:localhost:8081
```

Then open <http://localhost:8081>. No VM port is opened and no firewall rule is added.

## Operate

```bash
docker compose -p bessstudio logs -f web        # logs
docker compose -p bessstudio restart web        # restart
docker compose -p bessstudio down               # stop and remove
git pull && docker compose -p bessstudio up -d --build   # update
docker image prune --filter label=none -f       # NEVER `docker system prune`
```

`restart: unless-stopped` means it comes back after a VM reboot.

## Pointing at a different Firebase project

The committed defaults target `bessstudio-e55e1`. To target another, put the values in
`~/bessstudio/.env` (git-ignored) and rebuild:

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_PUBLIC_ORG_ID=...
```

These are public client values — the API key identifies the project and authorises nothing;
Firestore rules are what protect the data. **No secret belongs in this file.** If the app ever needs
a real secret, create your own Secret Manager secret named `bessstudio-*`, entered with `read -rs`,
and never reuse the product's.

## If it ever needs Google Cloud resources

It needs none today. If that changes: name everything `bessstudio-*`, label `app=bessstudio`, region
`asia-south1`, and if Terraform is warranted use **your own directory** with
`bucket = "tarifforderstudio_tfstate"`, `prefix = "bessstudio/dev"`. Never run Terraform in
`~/tariff-oder/infra/gcp`.
