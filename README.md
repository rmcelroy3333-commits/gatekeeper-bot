# gatekeeper-bot

Manual gatekeeper for Clash clan Discords:
- On join → assign **Unverified**, post a review card
- Buttons: **Accept → Member/Elder/Co-Leader** or **Deny (Kick)**
- `/listroles` to print role IDs
- `/setupserver` builds categories/channels with correct perms
- **war-announcements**: everyone can see, **only Leader & Co-Leader** can post
- STAFF category: visible only to Leader & Co-Leader

## Quick Start (Replit)
1. **Import from GitHub** in Replit → select this repo.
2. Add **Secrets** (🔒):
   - `DISCORD_TOKEN` — your bot token
   - `GUILD_ID` — your server ID
   - (optional) `JOIN_REQUESTS_CHANNEL_ID` — if you already have #join-requests
3. Press **Run**. You should see "Logged in as ..." and "Slash commands registered".
4. In Discord:
   - Run `/listroles` → copy IDs for Leader, Co-Leader, Elder, Member, Unverified.
   - Paste them into Replit Secrets:
     - `LEADER_ROLE_ID`, `COLEADER_ROLE_ID`, `ELDER_ROLE_ID`, `MEMBER_ROLE_ID`, `UNVERIFIED_ROLE_ID`
   - Press **Run** again to reload.
   - Run `/setupserver` to auto-create channels and set perms.

## Required Bot Intents / Permissions
In the **Discord Developer Portal → Bot**:
- Enable **SERVER MEMBERS INTENT**.

Invite with permissions:
- Manage Roles, Manage Channels, Kick Members, View Channels, Send Messages, Read Message History, Use Application Commands.

## Railway/Render
Use the provided `Procfile` (`worker: node index.js`) or set start command to `node index.js`.

## Notes
- Kicks on Deny require the bot role to be **above** target roles.
- Leader & Co-Leader have the same exclusive posting to **#war-announcements** and access to STAFF channels. If you want Leader to have full admin, give **Administrator** to the Leader role in the Discord UI; Co-Leader can have the same moderation perms without Administrator.
