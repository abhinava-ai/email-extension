# Private access model

Mail Template Vault has no public registration, subscriptions, email verification, or client-side paid flags. Users are created manually in MySQL and authenticate through the same Next.js API from the portal and extension.

The initial administrators are `sandeep@abhinava.ai` and `ankita@abhinava.ai`. Bootstrap creates them with administrator roles and mandatory password changes. Passwords are bcrypt-hashed; sessions use random opaque tokens whose SHA-256 hashes are stored in MySQL. Changing a password revokes every existing session.

All active members share one private template library. Template updates require the version that was loaded by the editor, preventing silent last-writer overwrites. The server sanitizes HTML regardless of client-side sanitization. The extension’s local storage is an offline cache, not an authority.
