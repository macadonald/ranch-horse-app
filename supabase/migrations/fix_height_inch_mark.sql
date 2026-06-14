-- Preview: guests whose height is X'Y (missing trailing inch mark)
-- Run this first to see what will be changed.
SELECT id, name, room_number, height, height || '"' AS height_fixed
FROM guests
WHERE height ~ '^[0-9]+''[0-9]+$';

-- Apply: append the missing " to all matching rows
-- Only run after reviewing the SELECT above.
UPDATE guests
SET height = height || '"'
WHERE height ~ '^[0-9]+''[0-9]+$'
RETURNING id, name, height;
