# Private access model

Mail Template Vault has no public registration, subscriptions, email verification, or client-side paid flags. Administrators add, reset, promote and deactivate members from the portal's Team page. Temporary passwords are random, shown once to the administrator, and must be replaced at first sign-in. Members are deactivated rather than deleted, so template history stays intact. An administrator cannot change their own role or access.

The initial administrators are `sandeep@abhinava.ai` and `ankita@abhinava.ai`. Bootstrap creates them with administrator roles and mandatory password changes. Passwords are bcrypt-hashed; sessions use random opaque tokens whose SHA-256 hashes are stored in MySQL. Changing a password revokes every existing session.

All active members share one private template library. Template updates require the version that was loaded by the editor, preventing silent last-writer overwrites. The server sanitizes HTML regardless of client-side sanitization. The extension’s local storage is an offline cache, not an authority.
