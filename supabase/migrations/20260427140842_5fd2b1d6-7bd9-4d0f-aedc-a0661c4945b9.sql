INSERT INTO public.dealers (acctivate_id, name, street_address, city, state, lat, lng, status)
VALUES
  ('CoastFurnitureInc', 'Coast Furniture Inc', '2380 W Bayshore Rd', 'Gulf Breeze', 'FL', 30.38502, -87.12518, 'active'),
  ('Furniture South', 'Furniture South', '4552 US Hwy 98 W', 'Santa Rosa Beach', 'FL', 30.3755, -86.25348, 'active'),
  ('53e46a36-f29f-4fc4-a479-730f388e4691', 'Mike''s Mattress, Inc.', '23330 Harborview Road', 'Port Charlotte', 'FL', 26.96597, -82.06366, 'active'),
  ('f065df80-b374-47cc-b5c9-da4a24b80b8a', 'Sprintz Furniture', '325 White Bridge Pike', 'Nashville', 'TN', 36.14671, -86.85856, 'active'),
  ('7b3c7913-a110-433b-a38c-c4f981a88040', 'Joe''s Furniture Co. Inc', '3787 Karicio Ln', 'Prescott', 'AZ', 34.546589, -112.397743, 'active'),
  ('2f4cb270-e073-47c6-928f-edda0ba0b464', 'Jernigan Furniture', '2101 E Ash St', 'Goldsboro', 'NC', 35.37688, -77.9635, 'active'),
  ('ae826c33-f886-4276-9d0b-8839734e831c', 'Wood''s Home Furnishings', '228 Ronald Tharrington Rd', 'Louisburg', 'NC', 36.09981, -78.27857, 'active')
ON CONFLICT (acctivate_id) DO NOTHING;