-- Update outlet + restaurant to real Hyderabad kitchen location
-- Madhapur area: 17.4172 N, 78.4428 E
UPDATE outlets SET
  latitude = '17.4172',
  longitude = '78.4428',
  latitude_num = 17.4172,
  longitude_num = 78.4428,
  coordinates_confirmed_at = NOW()
WHERE id = 'outlet_sg_koramangala';

UPDATE restaurants SET
  latitude = '17.4172',
  longitude = '78.4428',
  latitude_num = 17.4172,
  longitude_num = 78.4428
WHERE id = 'rest_spice_garden';

-- Verify
SELECT id, name, latitude, longitude FROM outlets WHERE id = 'outlet_sg_koramangala';
SELECT id, name, latitude, longitude FROM restaurants WHERE id = 'rest_spice_garden';
