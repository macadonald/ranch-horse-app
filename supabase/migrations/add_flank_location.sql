alter table horse_health_issues
  drop constraint if exists horse_health_issues_location_check;

alter table horse_health_issues
  add constraint horse_health_issues_location_check check (location in (
    'left_front_hoof', 'right_front_hoof', 'left_rear_hoof', 'right_rear_hoof',
    'left_front_leg', 'right_front_leg', 'left_rear_leg', 'right_rear_leg',
    'back', 'cinch', 'wither', 'neck', 'chest', 'flank', 'face', 'eyes'
  ));
