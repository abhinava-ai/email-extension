create table if not exists users (
  id char(36) primary key,
  email varchar(254) not null unique,
  display_name varchar(120) not null,
  password_hash varchar(100) not null,
  role enum('admin','member') not null default 'member',
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamp(3) not null default current_timestamp(3),
  updated_at timestamp(3) not null default current_timestamp(3) on update current_timestamp(3)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists sessions (
  id char(36) primary key,
  user_id char(36) not null,
  token_hash char(64) not null unique,
  expires_at timestamp(3) not null,
  last_seen_at timestamp(3) not null default current_timestamp(3),
  user_agent varchar(500),
  created_at timestamp(3) not null default current_timestamp(3),
  constraint sessions_user_fk foreign key (user_id) references users(id) on delete cascade,
  index sessions_user_idx (user_id), index sessions_expiry_idx (expires_at)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists login_attempts (
  attempt_key char(64) primary key,
  failures smallint unsigned not null default 0,
  blocked_until timestamp(3) null,
  updated_at timestamp(3) not null default current_timestamp(3) on update current_timestamp(3),
  index login_attempts_cleanup_idx (updated_at)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists templates (
  id varchar(100) primary key,
  name varchar(80) not null,
  html mediumtext not null,
  version int unsigned not null default 1,
  created_by char(36) not null,
  updated_by char(36) not null,
  created_at timestamp(3) not null default current_timestamp(3),
  updated_at timestamp(3) not null default current_timestamp(3) on update current_timestamp(3),
  deleted_at timestamp(3) null,
  constraint templates_created_by_fk foreign key (created_by) references users(id),
  constraint templates_updated_by_fk foreign key (updated_by) references users(id),
  index templates_updated_idx (deleted_at, updated_at)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists audit_events (
  id bigint unsigned auto_increment primary key,
  user_id char(36), event_type varchar(80) not null,
  entity_type varchar(40), entity_id varchar(100), metadata_json json,
  created_at timestamp(3) not null default current_timestamp(3),
  constraint audit_user_fk foreign key (user_id) references users(id) on delete set null,
  index audit_created_idx (created_at), index audit_user_idx (user_id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

