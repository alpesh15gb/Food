CREATE TABLE `integrationSecrets` (
	`id` varchar(36) NOT NULL,
	`restaurantId` varchar(36) NOT NULL,
	`provider` varchar(48) NOT NULL,
	`keyName` varchar(96) NOT NULL,
	`cipherText` text NOT NULL,
	`iv` varchar(64) NOT NULL,
	`authTag` varchar(64) NOT NULL,
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integrationSecrets_id` PRIMARY KEY(`id`),
	CONSTRAINT `integration_secret_key_idx` UNIQUE(`restaurantId`,`provider`,`keyName`)
);
--> statement-breakpoint
ALTER TABLE `integrationSecrets` ADD CONSTRAINT `integrationSecrets_restaurantId_restaurants_id_fk` FOREIGN KEY (`restaurantId`) REFERENCES `restaurants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integrationSecrets` ADD CONSTRAINT `integrationSecrets_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;