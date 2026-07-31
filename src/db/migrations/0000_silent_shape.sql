CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`type` text NOT NULL,
	`timestamp` integer NOT NULL,
	`payload` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_created` ON `activity_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `capacity_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`hours` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`last_sync_at` integer,
	`last_sync_status` text,
	`error_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_connectors_status` ON `connectors` (`status`);--> statement-breakpoint
CREATE TABLE `mirror_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`external_id` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mirror_entities_uniq` ON `mirror_entities` (`connector_id`,`entity_type`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_mirror_entity_type` ON `mirror_entities` (`entity_type`);--> statement-breakpoint
CREATE INDEX `idx_mirror_updated` ON `mirror_entities` (`updated_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`watermark` integer DEFAULT 0 NOT NULL,
	`last_full_reconcile_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`origin_kind` text,
	`origin_external_id` text,
	`origin_connector_id` text,
	`origin_entity_type` text,
	`status` text DEFAULT 'backlog' NOT NULL,
	`priority` integer DEFAULT -1 NOT NULL,
	`effort_minutes` integer,
	`due_at` integer,
	`course` text,
	`source` text,
	`overrides` text DEFAULT '{}' NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_due` ON `tasks` (`due_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_origin` ON `tasks` (`origin_entity_type`,`origin_external_id`);