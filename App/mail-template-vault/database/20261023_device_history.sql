alter table sessions add column if not exists client enum('web','extension') not null default 'web' after last_seen_at;
alter table sessions add column if not exists ip_address varchar(45) null after client;
alter table sessions add column if not exists logged_out_at timestamp(3) null after user_agent;
alter table sessions add column if not exists revoked_at timestamp(3) null after logged_out_at;
