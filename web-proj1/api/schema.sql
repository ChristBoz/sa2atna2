-- Schema for Event Finder (MySQL/MariaDB) — corrected

-- USERS TABLE
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `firebase_uid` VARCHAR(128) UNIQUE,
  `age` INT,
  `phone` VARCHAR(30),
  `location` VARCHAR(191),
  `bio` TEXT,
  `role` ENUM('owner', 'admin', 'user') DEFAULT 'user',
  `is_active` TINYINT(1) DEFAULT 1,
  `joined_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_role` (`role`),
  INDEX `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- GENRES TABLE
CREATE TABLE IF NOT EXISTS `genres` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `slug` VARCHAR(100) NOT NULL UNIQUE,
  `description` TEXT,
  `icon` VARCHAR(50),
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- EVENTS TABLE (references genres, users)
CREATE TABLE IF NOT EXISTS `events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `location` VARCHAR(255),
  `lat` DOUBLE,
  `lng` DOUBLE,
  `date` DATE,
  `time` TIME,
  `price` DECIMAL(10,2) DEFAULT 0.00,
  `image_url` VARCHAR(500),
  `status` ENUM('draft','published','archived') DEFAULT 'published',
  `genre_id` INT,
  `owner_id` INT NOT NULL,
  `capacity` INT DEFAULT 0,
  `available_spots` INT DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_events_genre` FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_events_owner` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_date` (`date`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- EVENT_GENRES (many-to-many)
CREATE TABLE IF NOT EXISTS `event_genres` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `event_id` INT NOT NULL,
  `genre_id` INT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_event_genre` (`event_id`, `genre_id`),
  CONSTRAINT `fk_event_genres_event` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_event_genres_genre` FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- USER_FAVORITES
CREATE TABLE IF NOT EXISTS `user_favorites` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `event_id` INT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_user_favorite` (`user_id`, `event_id`),
  INDEX `idx_user` (`user_id`),
  INDEX `idx_event` (`event_id`),
  CONSTRAINT `fk_fav_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fav_event` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- EVENT REGISTRATIONS
CREATE TABLE IF NOT EXISTS `registrations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `event_id` INT NOT NULL,
  `status` ENUM('registered','canceled') DEFAULT 'registered',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_user_event` (`user_id`, `event_id`),
  INDEX `idx_event` (`event_id`),
  INDEX `idx_user` (`user_id`),
  CONSTRAINT `fk_reg_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reg_event` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `comments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `event_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `comment` TEXT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_comment_event` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comment_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_event` (`event_id`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- SEED GENRES
INSERT IGNORE INTO `genres` (`name`, `slug`, `description`, `icon`) VALUES
('Music', 'music', 'Concerts, festivals, and live performances', '🎵'),
('Sports', 'sports', 'Sporting events and competitions', '⚽'),
('Food & Drink', 'food-drink', 'Food festivals, tastings, and culinary events', '🍔'),
('Arts & Culture', 'arts-culture', 'Art exhibitions, theater, and cultural events', '🎨'),
('Business', 'business', 'Conferences, networking, and professional events', '💼'),
('Technology', 'technology', 'Tech meetups, hackathons, and workshops', '💻'),
('Family', 'family', 'Family-friendly activities and events', '👨‍👩‍👧‍👦'),
('Nightlife', 'nightlife', 'Clubs, bars, and evening entertainment', '🌙'),
('Education', 'education', 'Workshops, classes, and learning opportunities', '📚'),
('Outdoor', 'outdoor', 'Outdoor activities and adventures', '🏕️'),
('Comedy', 'comedy', 'Stand-up comedy and humor shows', '😂'),
('Film', 'film', 'Movie screenings and film festivals', '🎬');

-- Ensure at least one user exists for owner_id references
INSERT IGNORE INTO `users` (`id`, `name`, `email`, `role`) VALUES
(1, 'Owner User', 'owner@example.com', 'owner');

-- SEED EVENTS (fix URLs and numbers)
INSERT INTO `events` (
  `name`, `description`, `location`, `date`, `time`, `price`, `image_url`,
  `genre_id`, `owner_id`, `capacity`, `available_spots`
) VALUES
('Summer Music Festival', 'The biggest summer music festival featuring top artists from around the world. Three days of non-stop entertainment!', 'Central Park, New York', '2025-07-15', '18:00:00', 89.99, 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600', 1, 1, 5000, 5000),
('Tech Conference 2025', 'Annual technology conference featuring keynotes from industry leaders, workshops, and networking opportunities.', 'Convention Center, San Francisco', '2025-08-20', '09:00:00', 299.00, 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600', 5, 1, 1000, 1000),
('Comedy Night Live', 'An evening of laughter with stand-up performances from the best comedians in the country.', 'Comedy Club, Los Angeles', '2025-06-10', '20:00:00', 35.00, 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=600', 4, 1, 200, 200),
('Shakespeare in the Park', 'Free outdoor performance of Romeo and Juliet by the City Theater Company.', 'Riverside Park, Chicago', '2025-06-25', '19:30:00', 0.00, 'https://images.unsplash.com/photo-1503095396549-807759245b35?w=600', 3, 1, 500, 500),
('NBA Finals Game 3', 'Eastern Conference Finals - Experience the excitement live!', 'Madison Square Garden, New York', '2025-06-18', '20:00:00', 250.00, 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=600', 2, 1, 20000, 15000),
('Food & Wine Expo', 'Taste dishes from over 50 restaurants and wineries. Cooking demos and wine tastings included.', 'Expo Center, Miami', '2025-07-22', '12:00:00', 75.00, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600', 5, 1, 800, 650),
('Rock Concert: The Legends', 'Classic rock tribute band performing hits from the 70s and 80s.', 'Arena Stadium, Boston', '2025-08-05', '19:00:00', 65.00, 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=600', 1, 1, 15000, 12000),
('Art Gallery Opening', 'Exhibition opening featuring contemporary artists. Wine and cheese reception included.', 'Modern Art Museum, Seattle', '2025-06-30', '18:00:00', 25.00, 'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=600', 5, 1, 150, 150),
('Marathon 2025', 'Annual city marathon. Register now for early bird pricing!', 'Downtown, Portland', '2025-09-10', '07:00:00', 45.00, 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=600', 2, 1, 3000, 2500),
('Jazz Night Under the Stars', 'Smooth jazz performances in an intimate outdoor setting. Bring a blanket!', 'Botanical Gardens, Austin', '2025-07-08', '20:30:00', 40.00, 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=600', 1, 1, 300, 300);



-- Link sample events to genres (many-to-many)
INSERT IGNORE INTO `event_genres` (`event_id`, `genre_id`) VALUES
(1, 1),   -- Summer Music Festival → Music
(2, 6),   -- Tech Conference 2025 → Technology
(3, 11),  -- Comedy Night Live → Comedy
(4, 4),   -- Shakespeare in the Park → Arts & Culture
(5, 2),   -- NBA Finals Game 3 → Sports
(6, 3),   -- Food & Wine Expo → Food & Drink
(7, 1),   -- Rock Concert: The Legends → Music
(8, 4),   -- Art Gallery Opening → Arts & Culture
(9, 2),   -- Marathon 2025 → Sports
(10, 1);  -- Jazz Night Under the Stars → Music