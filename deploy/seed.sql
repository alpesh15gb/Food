-- =============================================================================
-- Spice Garden — Seed Data
-- Run: docker compose -f deploy/docker-compose.yml --env-file deploy/config.env exec db psql -U cloudkitchen -d cloudkitchen -f /docker-entrypoint-initdb.d/seed.sql
-- Or: cat deploy/seed.sql | docker compose -f deploy/docker-compose.yml --env-file deploy/config.env exec -T db psql -U cloudkitchen -d cloudkitchen
-- =============================================================================

-- Restaurant
INSERT INTO restaurants (id, slug, name, description, cuisine_summary, logo_url, banner_image_url, contact_phone, address, latitude, longitude, delivery_fee_paise, packaging_fee_paise, min_order_paise, is_open, allow_scheduled_orders, preparation_minutes, delivery_radius_km, gst_percentage)
VALUES ('rest_spice_garden', 'spice-garden', 'Spice Garden', 'Authentic Indian cuisine crafted with love and the finest spices. From traditional curries to modern fusion dishes, every bite tells a story.', 'North Indian • Mughlai • Biryani • Kebabs', '/assets/spice-garden-logo.png', '/assets/spice-garden-banner.jpg', '+91 98765 43210', '42, 100 Feet Road, Koramangala, Bengaluru', '12.9352', '77.6245', 3000, 1500, 19900, true, true, 25, '5', '5');

-- Outlets
INSERT INTO outlets (id, restaurant_id, name, address, city, postal_code, latitude, longitude, preparation_minutes, is_active, is_open)
VALUES
  ('outlet_sg_koramangala', 'rest_spice_garden', 'Koramangala Kitchen', '42, 100 Feet Road, Koramangala', 'Bengaluru', '560034', '12.9352', '77.6245', 25, true, true),
  ('outlet_sg_indiranagar', 'rest_spice_garden', 'Indiranagar Kitchen', '789, 12th Main, Indiranagar', 'Bengaluru', '560038', '12.9784', '77.6408', 30, true, true);

-- Restaurant Schedules (all 7 days)
INSERT INTO restaurant_schedules (id, restaurant_id, day_of_week, open_time, close_time, is_active)
VALUES
  ('sch_sun', 'rest_spice_garden', 0, '10:00', '01:00', true),
  ('sch_mon', 'rest_spice_garden', 1, '09:00', '23:00', true),
  ('sch_tue', 'rest_spice_garden', 2, '09:00', '23:00', true),
  ('sch_wed', 'rest_spice_garden', 3, '09:00', '23:00', true),
  ('sch_thu', 'rest_spice_garden', 4, '09:00', '23:00', true),
  ('sch_fri', 'rest_spice_garden', 5, '09:00', '23:00', true),
  ('sch_sat', 'rest_spice_garden', 6, '10:00', '01:00', true);

-- Categories
INSERT INTO menu_categories (id, restaurant_id, name, slug, sort_order, is_visible, is_open, icon_emoji)
VALUES
  ('cat_starters', 'rest_spice_garden', 'Starters & Appetizers', 'starters', 1, true, true, '🥗'),
  ('cat_tandoori', 'rest_spice_garden', 'Tandoori Specials', 'tandoori', 2, true, true, '🔥'),
  ('cat_curries', 'rest_spice_garden', 'Curries & Gravies', 'curries', 3, true, true, '🍛'),
  ('cat_biryani', 'rest_spice_garden', 'Biryani', 'biryani', 4, true, true, '🍚'),
  ('cat_breads', 'rest_spice_garden', 'Breads & Rice', 'breads-rice', 5, true, true, '🫓'),
  ('cat_combos', 'rest_spice_garden', 'Combos & Thalis', 'combos', 6, true, true, '🍽️'),
  ('cat_snacks', 'rest_spice_garden', 'Snacks & Chaat', 'snacks', 7, true, true, '🥪'),
  ('cat_desserts', 'rest_spice_garden', 'Desserts', 'desserts', 8, true, true, '🍮'),
  ('cat_beverages', 'rest_spice_garden', 'Beverages', 'beverages', 9, true, true, '🥤');

-- Menu Items
INSERT INTO menu_items (id, restaurant_id, category_id, name, slug, description, price_paise, dietary_type, availability, is_open, is_customizable, is_bestseller, is_recommended, sort_order)
VALUES
  -- Starters
  ('item_01', 'rest_spice_garden', 'cat_starters', 'Paneer Tikka', 'paneer-tikka', 'Marinated paneer cubes grilled to perfection in a tandoor with bell peppers and onions.', 24900, 'veg', 'AVAILABLE', true, false, true, false, 1),
  ('item_02', 'rest_spice_garden', 'cat_starters', 'Chicken Malai Tikka', 'chicken-malai-tikka', 'Creamy, tender chicken tikka marinated in a rich malai blend with mild spices.', 29900, 'nonveg', 'AVAILABLE', true, false, false, true, 2),
  ('item_03', 'rest_spice_garden', 'cat_starters', 'Veg Spring Rolls', 'veg-spring-rolls', 'Crispy rolls stuffed with mixed vegetables and served with sweet chilli sauce.', 19900, 'veg', 'AVAILABLE', true, false, false, false, 3),
  ('item_04', 'rest_spice_garden', 'cat_starters', 'Fish Amritsari', 'fish-amritsari', 'Batter-fried river fish with tangy masala and mint chutney.', 34900, 'nonveg', 'AVAILABLE', true, false, false, false, 4),

  -- Tandoori
  ('item_05', 'rest_spice_garden', 'cat_tandoori', 'Tandoori Chicken', 'tandoori-chicken', 'Half chicken marinated for 24 hours and cooked in the clay oven. Served with mint chutney and onion rings.', 34900, 'nonveg', 'AVAILABLE', true, false, true, false, 1),
  ('item_06', 'rest_spice_garden', 'cat_tandoori', 'Paneer Seekh Kebab', 'paneer-seekh-kebab', 'Spiced paneer and vegetable kebabs cooked over charcoal.', 27900, 'veg', 'AVAILABLE', true, false, false, false, 2),
  ('item_07', 'rest_spice_garden', 'cat_tandoori', 'Chicken Reshmi Kebab', 'chicken-reshmi-kebab', 'Silky smooth minced chicken kebabs with a delicate cream marinade.', 32900, 'nonveg', 'AVAILABLE', true, false, false, false, 3),

  -- Curries
  ('item_08', 'rest_spice_garden', 'cat_curries', 'Butter Chicken', 'butter-chicken', 'Tender chicken pieces in a velvety tomato-cream sauce with aromatic spices.', 32900, 'nonveg', 'AVAILABLE', true, false, true, false, 1),
  ('item_09', 'rest_spice_garden', 'cat_curries', 'Paneer Butter Masala', 'paneer-butter-masala', 'Cottage cheese cubes in a rich, creamy tomato gravy with butter and spices.', 28900, 'veg', 'AVAILABLE', true, false, false, true, 2),
  ('item_10', 'rest_spice_garden', 'cat_curries', 'Dal Makhani', 'dal-makhani', 'Black lentils slow-cooked overnight with butter, cream, and aromatic spices.', 24900, 'veg', 'AVAILABLE', true, false, false, false, 3),
  ('item_11', 'rest_spice_garden', 'cat_curries', 'Chicken Korma', 'chicken-korma', 'Mild and creamy chicken curry with a blend of roasted nuts and whole spices.', 31900, 'nonveg', 'AVAILABLE', true, false, false, false, 4),
  ('item_12', 'rest_spice_garden', 'cat_curries', 'Palak Paneer', 'palak-paneer', 'Fresh spinach puree with soft paneer cubes, seasoned with garlic and cumin.', 26900, 'veg', 'AVAILABLE', true, false, false, false, 5),
  ('item_13', 'rest_spice_garden', 'cat_curries', 'Mutton Rogan Josh', 'mutton-rogan-josh', 'Slow-cooked mutton in a rich Kashmiri masala with aromatic whole spices.', 44900, 'nonveg', 'AVAILABLE', true, false, false, false, 6),

  -- Biryani
  ('item_14', 'rest_spice_garden', 'cat_biryani', 'Hyderabadi Chicken Biryani', 'hyderabadi-chicken-biryani', 'Fragrant basmati rice layered with spiced chicken, cooked dum-style with saffron.', 29900, 'nonveg', 'AVAILABLE', true, false, true, false, 1),
  ('item_15', 'rest_spice_garden', 'cat_biryani', 'Veg Biryani', 'veg-biryani', 'Aromatic rice layered with garden vegetables, mint, and saffron.', 24900, 'veg', 'AVAILABLE', true, false, false, false, 2),
  ('item_16', 'rest_spice_garden', 'cat_biryani', 'Mutton Biryani', 'mutton-biryani', 'Slow-cooked mutton biryani with tender pieces and rich masala.', 42900, 'nonveg', 'AVAILABLE', true, false, false, false, 3),
  ('item_17', 'rest_spice_garden', 'cat_biryani', 'Egg Biryani', 'egg-biryani', 'Fluffy basmati rice with perfectly boiled eggs in a fragrant spice blend.', 22900, 'egg', 'AVAILABLE', true, false, false, false, 4),

  -- Breads
  ('item_18', 'rest_spice_garden', 'cat_breads', 'Butter Naan', 'butter-naan', 'Soft, fluffy naan brushed with butter, baked in the tandoor.', 6900, 'veg', 'AVAILABLE', true, false, false, false, 1),
  ('item_19', 'rest_spice_garden', 'cat_breads', 'Garlic Naan', 'garlic-naan', 'Naan topped with garlic and cilantro, fresh from the clay oven.', 7900, 'veg', 'AVAILABLE', true, false, false, false, 2),
  ('item_20', 'rest_spice_garden', 'cat_breads', 'Jeera Rice', 'jeera-rice', 'Fluffy basmati rice tempered with cumin seeds and ghee.', 14900, 'veg', 'AVAILABLE', true, false, false, false, 3),

  -- Combos
  ('item_21', 'rest_spice_garden', 'cat_combos', 'Paneer Thali', 'paneer-thali', 'Complete meal with paneer butter masala, dal, rice, naan, raita, and dessert.', 39900, 'veg', 'AVAILABLE', true, false, false, true, 1),
  ('item_22', 'rest_spice_garden', 'cat_combos', 'Chicken Thali', 'chicken-thali', 'Complete meal with chicken curry, dal, rice, naan, raita, and dessert.', 44900, 'nonveg', 'AVAILABLE', true, false, false, false, 2),

  -- Snacks
  ('item_23', 'rest_spice_garden', 'cat_snacks', 'Pani Puri', 'pani-puri', 'Crispy puris with spiced mint water, tamarind, and tangy filling.', 9900, 'veg', 'AVAILABLE', true, false, false, false, 1),
  ('item_24', 'rest_spice_garden', 'cat_snacks', 'Samosa Chaat', 'samosa-chaat', 'Crispy samosas topped with yogurt, chutneys, and crunchy sev.', 14900, 'veg', 'AVAILABLE', true, false, false, false, 2),

  -- Desserts
  ('item_25', 'rest_spice_garden', 'cat_desserts', 'Gulab Jamun (2 pcs)', 'gulab-jamun', 'Soft, golden dumplings soaked in cardamom-flavored sugar syrup.', 12900, 'veg', 'AVAILABLE', true, false, false, false, 1),
  ('item_26', 'rest_spice_garden', 'cat_desserts', 'Ras Malai', 'ras-malai', 'Delicate milk dumplings floating in saffron-flavored sweetened milk.', 14900, 'veg', 'AVAILABLE', true, false, true, false, 2),
  ('item_27', 'rest_spice_garden', 'cat_desserts', 'Kheer', 'kheer', 'Creamy rice pudding slow-cooked with milk, sugar, and cardamom.', 11900, 'veg', 'AVAILABLE', true, false, false, false, 3),

  -- Beverages
  ('item_28', 'rest_spice_garden', 'cat_beverages', 'Mango Lassi', 'mango-lassi', 'Thick, creamy yogurt shake blended with ripe mangoes.', 12900, 'veg', 'AVAILABLE', true, false, false, false, 1),
  ('item_29', 'rest_spice_garden', 'cat_beverages', 'Masala Chai', 'masala-chai', 'Traditional Indian tea brewed with aromatic spices and milk.', 5900, 'veg', 'AVAILABLE', true, false, false, false, 2),
  ('item_30', 'rest_spice_garden', 'cat_beverages', 'Fresh Lime Soda', 'fresh-lime-soda', 'Refreshing lime soda with a hint of salt or sweet.', 7900, 'veg', 'AVAILABLE', true, false, false, false, 3),
  ('item_31', 'rest_spice_garden', 'cat_beverages', 'Cold Coffee', 'cold-coffee', 'Iced coffee blended with milk and a scoop of vanilla ice cream.', 14900, 'veg', 'AVAILABLE', true, false, false, false, 4);

-- Admin Roles
INSERT INTO admin_roles (id, name, description, is_system)
VALUES
  ('role_super_admin', 'Super Admin', 'Full access to all features', true),
  ('role_ops_manager', 'Operations Manager', 'Order management and restaurant operations', false),
  ('role_kitchen_manager', 'Kitchen Manager', 'Menu and order management, no financial access', false);
