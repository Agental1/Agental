-- A few open castings so GET /api/castings returns something immediately.
insert into public.castings (title, category, city, status, pay_min, pay_max, deadline, description) values
  ('Background actors for indie feature', 'background', 'Los Angeles', 'open', 150, 200, current_date + 30, 'Non-union background for a 3-day shoot.'),
  ('Commercial — national beverage brand', 'commercial', 'New York', 'open', 500, 800, current_date + 14, 'On-camera talent, one speaking line.'),
  ('Voice actor for animated short', 'voice', 'Remote', 'open', 300, 300, current_date + 21, 'Recorded remotely; home studio preferred.');
