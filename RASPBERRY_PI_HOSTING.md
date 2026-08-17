# Raspberry Pi hosting guide

This guide installs Draft Room as a locked-down Raspberry Pi service and makes it reachable away from home without forwarding the app or SSH ports through Google Nest Wifi Pro.

## Recommended design

Use one of these outbound-tunnel designs while keeping Draft Room bound to `127.0.0.1`:

1. **Tailscale Serve — recommended for personal use.** Only devices and users admitted to your Tailscale network can open the site. Install the Tailscale app on your phone and laptop. No domain or router rule is required.
2. **Cloudflare Tunnel plus Access.** Use this when you want a normal public hostname without installing Tailscale on each client. A domain on Cloudflare is required. Cloudflare Access must protect the entire hostname with an exact-user allow policy before the tunnel route is published.

Do not forward TCP `4173`, TCP `22`, or any other Pi port on Google Nest Wifi. Draft Room is a single-trusted-user application: its workspaces and connector credentials are shared by the server instance, not separated into public user accounts.

Official references:

- [Raspberry Pi OS and Imager](https://www.raspberrypi.com/documentation/computers/getting-started.html)
- [Raspberry Pi OS documentation](https://www.raspberrypi.com/documentation/computers/os.html)
- [Debian Trixie ARM64 Node.js package](https://packages.debian.org/trixie/arm64/nodejs)
- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)
- [Cloudflare Tunnel setup](https://developers.cloudflare.com/tunnel/setup/)
- [Cloudflare Tunnel public hostnames](https://developers.cloudflare.com/tunnel/routing/)
- [Cloudflare Access self-hosted applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/choose-application-type/)
- [Cloudflare Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Google Nest DHCP reservation](https://support.google.com/googlehome/answer/6274660?hl=en-GB)

## 1. Prepare the Raspberry Pi

Recommended hardware:

- Raspberry Pi 4 or 5 with at least 2 GB RAM.
- Official or high-quality power supply.
- 64-bit Raspberry Pi OS Lite on a reliable microSD card; a USB SSD is preferable for long-term service use.
- Ethernet to the primary Google Nest router or a mesh point when practical.

In Raspberry Pi Imager, select the current 64-bit Raspberry Pi OS Lite release. In OS customization:

- Set a unique hostname such as `draft-room`.
- Create a non-default administrator username and strong password.
- Enable SSH with **public-key authentication** and add your public key.
- Configure Wi-Fi only if Ethernet is unavailable.
- Set the correct locale and timezone.

Boot the Pi, then connect from your computer:

```text
ssh <pi-admin>@draft-room.local
```

Update the signed Raspberry Pi OS packages and install only the local prerequisites:

```bash
sudo apt update
sudo apt full-upgrade
sudo apt install --no-install-recommends nodejs unzip unattended-upgrades
node --version
```

Draft Room requires Node.js 20 or newer. Current 64-bit Raspberry Pi OS is based on Debian Trixie, whose official ARM64 `nodejs` package meets that requirement. Draft Room itself has no third-party runtime packages, so do not run `npm install`.

Enable automatic security updates:

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
```

After verifying that SSH key login works in a second terminal, disable SSH password and root login:

```bash
sudo tee /etc/ssh/sshd_config.d/99-draft-room-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sudo sshd -t
sudo systemctl reload ssh
```

Keep the original SSH session open until the second key-authenticated session succeeds. Never expose SSH through Google Nest port forwarding.

## 2. Build and transfer a reviewed Linux release

On a trusted Linux development computer, from the Draft Room project:

```bash
node scripts/package-release.js --platform linux-arm64
```

The command creates `FantasyFootball-Assistant-<version>-linux-arm64.zip` and its `.sha256` file in `dist`. The Linux archive contains shell scripts and the Pi installer but excludes Windows `.cmd` launchers and the Windows installer. It is generated from the same explicit privacy allowlist as the other releases.

Transfer both files over your LAN with `scp`, a USB drive, or another method you control:

```bash
scp dist/FantasyFootball-Assistant-0.2.0-linux-arm64.zip <pi-admin>@draft-room.local:/home/<pi-admin>/
scp dist/FantasyFootball-Assistant-0.2.0-linux-arm64.zip.sha256 <pi-admin>@draft-room.local:/home/<pi-admin>/
```

On the Pi, verify the checksum before extracting:

```bash
cd "/home/<pi-admin>"
sha256sum -c FantasyFootball-Assistant-0.2.0-linux-arm64.zip.sha256
unzip FantasyFootball-Assistant-0.2.0-linux-arm64.zip
cd FantasyFootball-Assistant-0.2.0
```

Review `RELEASE-MANIFEST.json` if desired. The release excludes `.local-data`, league profiles, cookies, OAuth tokens, HAR files, logs, browser profiles, and Codex credentials.

## 3. Install the local service

Run the included offline installer from the extracted release:

```bash
sudo ./setup-pi.sh
```

The installer does not contact the internet. It:

- Copies only the release allowlist to `/opt/fantasy-football-assistant`.
- Creates the unprivileged `draftroom` service account.
- Creates or preserves `/opt/fantasy-football-assistant/.local-data`.
- Installs a hardened `systemd` unit.
- Creates `/etc/draft-room/draft-room.env` only when it does not already exist.
- Does not start the service before remote-access settings are chosen.

The app must remain loopback-only:

```text
HOST=127.0.0.1
PORT=4173
```

Do not change `HOST` to `0.0.0.0` for either recommended deployment.

## 4A. Private remote access with Tailscale

This is the safest and simplest choice for access from your own phone and computers.

1. Install Tailscale using only its [official Raspberry Pi/Linux package instructions](https://tailscale.com/docs/install/linux). Prefer the signed package repository instructions over copying third-party commands.
2. Join the Pi to your personal tailnet:

   ```bash
   sudo tailscale up
   ```

3. Start Draft Room locally so Tailscale can verify the backend:

   ```bash
   sudo systemctl enable --now draft-room
   curl -I http://127.0.0.1:4173/
   ```

4. Publish only the loopback service to your tailnet:

   ```bash
   sudo tailscale serve --bg 4173
   sudo tailscale serve status
   ```

5. Copy the exact HTTPS hostname shown by `tailscale serve status`, then edit:

   ```bash
   sudo nano /etc/draft-room/draft-room.env
   ```

   Example:

   ```text
   HOST=127.0.0.1
   PORT=4173
   PUBLIC_ORIGIN=https://draft-room.example-tailnet.ts.net
   ALLOWED_HOSTS=draft-room.example-tailnet.ts.net
   ```

6. Restart the app:

   ```bash
   sudo systemctl restart draft-room
   ```

7. Install Tailscale on the phone/laptop, sign in to the same tailnet, and open the HTTPS URL. In the Tailscale admin console, admit only your own users and devices. Do not use Tailscale Funnel; Funnel intentionally publishes a service to the public internet, while Serve keeps it private to the tailnet.

## 4B. Public hostname with Cloudflare Tunnel and Access

Use this option only if you need browser access without a Tailscale client.

1. Add a domain you control to Cloudflare.
2. In Cloudflare Zero Trust, create an **Access self-hosted application** for `draft.example.com` before publishing the tunnel route.
3. Create an Access policy that:
   - Allows only your exact email address or a tightly controlled identity-provider group.
   - Requires your identity provider's MFA.
   - Uses a reasonably short session duration.
   - Has no public `Bypass` or `Everyone` rule.
4. Edit the Draft Room environment:

   ```bash
   sudo nano /etc/draft-room/draft-room.env
   ```

   ```text
   HOST=127.0.0.1
   PORT=4173
   PUBLIC_ORIGIN=https://draft.example.com
   ALLOWED_HOSTS=draft.example.com
   ```

5. Start and verify Draft Room:

   ```bash
   sudo systemctl enable --now draft-room
   curl -I http://127.0.0.1:4173/
   ```

6. In Cloudflare Zero Trust, create a remotely managed Cloudflare Tunnel. Install `cloudflared` on ARM64 using only Cloudflare's official signed package instructions or the exact command generated in your authenticated dashboard.
7. Add one public-hostname route:
   - Hostname: `draft.example.com`
   - Service type: `HTTP`
   - Service URL: `http://127.0.0.1:4173`
8. Install/run the tunnel as a system service using the one-time token shown by Cloudflare. Treat that token as a password; never paste it into Git, a league export, or a support message.
9. Test in a private browser window on cellular data. Cloudflare Access must challenge before any Draft Room HTML appears. After authorization, the app should load over HTTPS.

If Access is removed or bypassed, disable the public-hostname route immediately. Cloudflare Tunnel encrypts the route but does not replace access control by itself.

## 5. Google Nest Wifi Pro configuration

Neither recommended option needs an inbound router rule. The Pi makes an outbound connection to Tailscale or Cloudflare, and only that authenticated overlay reaches the loopback app.

In the Google Home app:

1. Connect the Pi to the primary network, preferably by Ethernet. Do not use the guest network, which can isolate local administration traffic.
2. Optionally reserve a stable LAN address for easier SSH administration:
   - **Wi-Fi → Network settings → Advanced networking → DHCP IP reservations**
   - Select the Pi and reserve its current address.
3. Open **Wi-Fi → Network settings → Advanced networking → Port management**.
4. Confirm there are no IPv4 or IPv6 rules forwarding `4173`, `22`, `80`, or `443` to the Pi. Delete any such rule created for Draft Room.
5. Optionally disable UPnP if no game console or other household device needs it. This is defense in depth, not a Draft Room requirement, and can affect automatic port mappings for other devices.

Google Nest Wifi Pro does not need DMZ mode, bridge mode, custom DNS exposure, or firewall exceptions for this design. If you later require network-level VLAN isolation, Google Nest's consumer controls are limited; use a dedicated firewall/router rather than weakening the tunnel design.

## 6. Validate the exposure

On the Pi:

```bash
sudo systemctl status draft-room --no-pager
sudo journalctl -u draft-room -n 100 --no-pager
curl -I http://127.0.0.1:4173/
sudo ss -ltnp
```

The Node listener for port `4173` must show `127.0.0.1:4173`, never `0.0.0.0:4173`, `[::]:4173`, or the Pi's LAN address.

From another LAN computer, `http://<pi-lan-address>:4173` should fail. From cellular data:

- Tailscale option: the site works only while the client is signed into the permitted tailnet.
- Cloudflare option: the HTTPS hostname shows Cloudflare Access first, then Draft Room after MFA/login.
- Direct connections to your home public IP on `4173` and `22` must fail.

Common failures:

- **403 Forbidden host:** `ALLOWED_HOSTS` does not exactly contain the external hostname.
- **403 Forbidden origin on save/sync:** `PUBLIC_ORIGIN` is not the exact external HTTPS origin.
- **502 from the tunnel:** check `systemctl status draft-room` and `curl http://127.0.0.1:4173/`.
- **Blank league:** import a full profile or sync a provider workspace; a clean installation intentionally contains no private league data.

## 7. Restore league profiles and connectors

Open **Data & sources → Import full profile** for each exported league. Full profiles restore league settings, keepers, manager brains, draft state, favorites, rosters, waivers, matchups, and saved workspace state.

Connector credentials are deliberately excluded:

- **Yahoo:** register the exact external callback, such as `https://draft.example.com/api/connectors/yahoo/callback`, then authorize again.
- **ESPN:** the interactive Firefox button requires a graphical user session and therefore cannot launch from the hardened headless `systemd` service. Import a freshly captured ESPN HAR through the existing controlled importer, or run a supported Firefox session on a Pi desktop installation. HAR files and ESPN cookies are secrets; delete the source HAR after successful import and never place it in the app folder.
- **Codex rankings refresh:** this requires a separately installed, supported ARM64 Codex CLI authenticated for the `draftroom` service account. Leave the feature unavailable rather than copying personal Codex credentials onto the Pi.

Anyone admitted through Tailscale or Cloudflare Access can see the same server workspaces and trigger permitted server actions. Restrict access to yourself unless true server-side multi-user isolation is implemented later.

## 8. Backups and upgrades

Use **Export full profile** regularly. Those exports omit connector secrets and are the safest portable backups.

For a complete private server backup, stop the app and archive `.local-data`:

```bash
sudo systemctl stop draft-room
sudo tar -C /opt/fantasy-football-assistant -czf /home/<pi-admin>/draft-room-private-backup.tgz .local-data
sudo chown <pi-admin>:<pi-admin> /home/<pi-admin>/draft-room-private-backup.tgz
chmod 600 /home/<pi-admin>/draft-room-private-backup.tgz
sudo systemctl start draft-room
```

That archive can contain provider credentials. Store it encrypted and offline, never in GitHub or ordinary cloud storage.

To upgrade:

1. Build a new reviewed release and verify its SHA-256 on the Pi.
2. Export full profiles and make an encrypted `.local-data` backup.
3. Extract the new release.
4. Run `sudo ./setup-pi.sh` from the new Linux release. The installer preserves the existing environment and `.local-data`.
5. Restart and validate:

   ```bash
   sudo systemctl restart draft-room
   sudo systemctl status draft-room --no-pager
   ```

## Final security checklist

- Draft Room listens only on `127.0.0.1:4173`.
- Google Nest has no port-forward rule for the Pi.
- SSH uses keys, rejects root/password login, and is not internet-forwarded.
- Tailscale Serve is limited to your tailnet, or Cloudflare Access protects the complete hostname with MFA.
- `.local-data`, tunnel tokens, HAR files, cookies, and OAuth secrets never enter Git.
- Raspberry Pi OS security updates and Draft Room backups are current.
- External cellular testing confirms that only the authenticated HTTPS path works.
