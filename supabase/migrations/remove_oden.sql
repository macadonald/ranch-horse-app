-- Oden has moved ranches — remove from all tables
delete from shoe_needs            where horse_name = 'Oden';
delete from farrier_visit_horses  where horse_name = 'Oden';
delete from horse_health_issues   where horse_name = 'Oden';
delete from other_animals         where name       = 'Oden';
