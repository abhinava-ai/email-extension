# Private access model

Mail Template Vault has no public registration, subscriptions, email verification, or client-side paid flags. Administrators add, reset, promote and deactivate members from the portal's Team page. Members join through an emailed invitation link and choose their own password; if email is unavailable, the administrator gets the link to share instead. Links work once, are stored only as hashes, and expire after 7 days for invitations and 1 hour for password resets. Members are deactivated rather than deleted, so template history stays intact. An administrator cannot change their own role or access.

The initial administrators are `sandeep@abhinava.ai` and `ankita@abhinava.ai`. Bootstrap creates them with administrator roles and mandatory password changes. Passwords are bcrypt-hashed; sessions use random opaque tokens whose SHA-256 hashes are stored in MySQL. Changing a password revokes every existing session.

All active members share one private template library. Template updates require the version that was loaded by the editor, preventing silent last-writer overwrites. The server sanitizes HTML regardless of client-side sanitization. The extension’s local storage is an offline cache, not an authority.
