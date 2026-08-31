CREATE TABLE `cartItems` (
	`id` varchar(36) NOT NULL,
	`cartId` varchar(36) NOT NULL,
	`menuItemId` varchar(36) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`selectedModifiers` json NOT NULL,
	`specialInstructions` varchar(300),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cartItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `carts` (
	`id` varchar(36) NOT NULL,
	`restaurantId` varchar(36) NOT NULL,
	`outletId` varchar(36) NOT NULL,
	`customerId` varchar(36),
	`sessionKey` varchar(96),
	`couponCode` varchar(48),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `carts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` varchar(36) NOT NULL,
	`restaurantId` varchar(36) NOT NULL,
	`code` varchar(48) NOT NULL,
	`description` varchar(255) NOT NULL,
	`discountType` enum('flat','percent') NOT NULL DEFAULT 'flat',
	`discountValue` int NOT NULL,
	`minOrderPaise` int NOT NULL DEFAULT 0,
	`maxDiscountPaise` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupon_code_per_restaurant` UNIQUE(`restaurantId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `customerAddresses` (
	`id` varchar(36) NOT NULL,
	`customerId` varchar(36) NOT NULL,
	`label` enum('Home','Work','Other') NOT NULL DEFAULT 'Home',
	`flatHouse` varchar(180) NOT NULL,
	`building` varchar(180),
	`street` varchar(180),
	`landmark` varchar(180),
	`area` varchar(180) NOT NULL,
	`city` varchar(120) NOT NULL,
	`postalCode` varchar(16),
	`latitude` varchar(32),
	`longitude` varchar(32),
	`deliveryInstructions` text,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customerAddresses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customerProfiles` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`mobileNumber` varchar(24),
	`preferredName` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customerProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `customerProfiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `menuCategories` (
	`id` varchar(36) NOT NULL,
	`restaurantId` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(120) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isVisible` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `menuCategories_id` PRIMARY KEY(`id`),
	CONSTRAINT `category_slug_per_restaurant` UNIQUE(`restaurantId`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `menuItems` (
	`id` varchar(36) NOT NULL,
	`restaurantId` varchar(36) NOT NULL,
	`categoryId` varchar(36) NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`pricePaise` int NOT NULL,
	`imageUrl` text,
	`dietaryType` enum('veg','nonveg','egg') NOT NULL DEFAULT 'veg',
	`tag` varchar(48),
	`availability` enum('AVAILABLE','SOLD_OUT','SCHEDULED_UNAVAILABLE','OUT_OF_STOCK','DISABLED') NOT NULL DEFAULT 'AVAILABLE',
	`availableNote` varchar(160),
	`isCustomizable` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `menuItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modifierGroups` (
	`id` varchar(36) NOT NULL,
	`menuItemId` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`selectionType` enum('single','multiple') NOT NULL DEFAULT 'single',
	`isRequired` boolean NOT NULL DEFAULT false,
	`minSelections` int NOT NULL DEFAULT 0,
	`maxSelections` int NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `modifierGroups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modifierOptions` (
	`id` varchar(36) NOT NULL,
	`modifierGroupId` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`pricePaise` int NOT NULL DEFAULT 0,
	`isAvailable` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `modifierOptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orderEvents` (
	`id` varchar(36) NOT NULL,
	`orderId` varchar(36) NOT NULL,
	`status` enum('PENDING_PAYMENT','PAYMENT_CONFIRMED','PLACED','RESTAURANT_ACCEPTED','PREPARING','READY_FOR_PICKUP','RIDER_ASSIGNED','PICKED_UP','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','REJECTED','REFUND_PENDING','REFUNDED') NOT NULL,
	`note` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orderItems` (
	`id` varchar(36) NOT NULL,
	`orderId` varchar(36) NOT NULL,
	`menuItemId` varchar(36),
	`itemNameSnapshot` varchar(180) NOT NULL,
	`unitPricePaise` int NOT NULL,
	`quantity` int NOT NULL,
	`selectedModifiers` json NOT NULL,
	`specialInstructions` varchar(300),
	CONSTRAINT `orderItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` varchar(36) NOT NULL,
	`orderNumber` varchar(32) NOT NULL,
	`restaurantId` varchar(36) NOT NULL,
	`outletId` varchar(36) NOT NULL,
	`customerId` varchar(36),
	`status` enum('PENDING_PAYMENT','PAYMENT_CONFIRMED','PLACED','RESTAURANT_ACCEPTED','PREPARING','READY_FOR_PICKUP','RIDER_ASSIGNED','PICKED_UP','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','REJECTED','REFUND_PENDING','REFUNDED') NOT NULL DEFAULT 'PENDING_PAYMENT',
	`paymentStatus` enum('PENDING','PAID','FAILED','CANCELLED','REFUND_PENDING','REFUNDED') NOT NULL DEFAULT 'PENDING',
	`fulfillmentType` enum('DELIVERY','PICKUP') NOT NULL DEFAULT 'DELIVERY',
	`addressSnapshot` json NOT NULL,
	`itemTotalPaise` int NOT NULL,
	`discountPaise` int NOT NULL DEFAULT 0,
	`packagingFeePaise` int NOT NULL DEFAULT 0,
	`deliveryFeePaise` int NOT NULL DEFAULT 0,
	`taxPaise` int NOT NULL DEFAULT 0,
	`totalPaise` int NOT NULL,
	`couponCode` varchar(48),
	`deliveryNotes` text,
	`cutleryPreference` boolean NOT NULL DEFAULT false,
	`estimatedMinutes` int,
	`scheduledFor` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `outlets` (
	`id` varchar(36) NOT NULL,
	`restaurantId` varchar(36) NOT NULL,
	`name` varchar(180) NOT NULL,
	`address` text NOT NULL,
	`city` varchar(120) NOT NULL,
	`postalCode` varchar(16),
	`latitude` varchar(32),
	`longitude` varchar(32),
	`preparationMinutes` int NOT NULL DEFAULT 25,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outlets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` varchar(36) NOT NULL,
	`orderId` varchar(36) NOT NULL,
	`provider` varchar(64) NOT NULL DEFAULT 'razorpay',
	`providerOrderId` varchar(120),
	`providerPaymentId` varchar(120),
	`status` enum('CREATED','AUTHORIZED','CAPTURED','FAILED','CANCELLED','REFUNDED') NOT NULL DEFAULT 'CREATED',
	`amountPaise` int NOT NULL,
	`providerPayload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `restaurants` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(96) NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`cuisineSummary` varchar(255) NOT NULL,
	`logoUrl` text,
	`bannerImageUrl` text,
	`primaryColor` varchar(16) NOT NULL DEFAULT '#C84630',
	`secondaryColor` varchar(16) NOT NULL DEFAULT '#F7E4D3',
	`contactPhone` varchar(32),
	`deliveryFeePaise` int NOT NULL DEFAULT 3900,
	`packagingFeePaise` int NOT NULL DEFAULT 2500,
	`minOrderPaise` int NOT NULL DEFAULT 19900,
	`isOpen` boolean NOT NULL DEFAULT true,
	`opensAt` varchar(24) NOT NULL DEFAULT '11:00 AM',
	`allowScheduledOrders` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurants_id` PRIMARY KEY(`id`),
	CONSTRAINT `restaurants_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
ALTER TABLE `cartItems` ADD CONSTRAINT `cartItems_cartId_carts_id_fk` FOREIGN KEY (`cartId`) REFERENCES `carts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cartItems` ADD CONSTRAINT `cartItems_menuItemId_menuItems_id_fk` FOREIGN KEY (`menuItemId`) REFERENCES `menuItems`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `carts` ADD CONSTRAINT `carts_restaurantId_restaurants_id_fk` FOREIGN KEY (`restaurantId`) REFERENCES `restaurants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `carts` ADD CONSTRAINT `carts_outletId_outlets_id_fk` FOREIGN KEY (`outletId`) REFERENCES `outlets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `carts` ADD CONSTRAINT `carts_customerId_customerProfiles_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customerProfiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_restaurantId_restaurants_id_fk` FOREIGN KEY (`restaurantId`) REFERENCES `restaurants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customerAddresses` ADD CONSTRAINT `customerAddresses_customerId_customerProfiles_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customerProfiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customerProfiles` ADD CONSTRAINT `customerProfiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menuCategories` ADD CONSTRAINT `menuCategories_restaurantId_restaurants_id_fk` FOREIGN KEY (`restaurantId`) REFERENCES `restaurants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menuItems` ADD CONSTRAINT `menuItems_restaurantId_restaurants_id_fk` FOREIGN KEY (`restaurantId`) REFERENCES `restaurants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menuItems` ADD CONSTRAINT `menuItems_categoryId_menuCategories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `menuCategories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `modifierGroups` ADD CONSTRAINT `modifierGroups_menuItemId_menuItems_id_fk` FOREIGN KEY (`menuItemId`) REFERENCES `menuItems`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `modifierOptions` ADD CONSTRAINT `modifierOptions_modifierGroupId_modifierGroups_id_fk` FOREIGN KEY (`modifierGroupId`) REFERENCES `modifierGroups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orderEvents` ADD CONSTRAINT `orderEvents_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orderItems` ADD CONSTRAINT `orderItems_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orderItems` ADD CONSTRAINT `orderItems_menuItemId_menuItems_id_fk` FOREIGN KEY (`menuItemId`) REFERENCES `menuItems`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_restaurantId_restaurants_id_fk` FOREIGN KEY (`restaurantId`) REFERENCES `restaurants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_outletId_outlets_id_fk` FOREIGN KEY (`outletId`) REFERENCES `outlets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_customerId_customerProfiles_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customerProfiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outlets` ADD CONSTRAINT `outlets_restaurantId_restaurants_id_fk` FOREIGN KEY (`restaurantId`) REFERENCES `restaurants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `menu_item_restaurant_idx` ON `menuItems` (`restaurantId`);--> statement-breakpoint
CREATE INDEX `menu_item_category_idx` ON `menuItems` (`categoryId`);--> statement-breakpoint
CREATE INDEX `order_event_order_idx` ON `orderEvents` (`orderId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_restaurant_status_idx` ON `orders` (`restaurantId`,`status`);--> statement-breakpoint
CREATE INDEX `order_customer_idx` ON `orders` (`customerId`);--> statement-breakpoint
CREATE INDEX `outlet_restaurant_idx` ON `outlets` (`restaurantId`);