-- Optional DEVELOPMENT fixtures only. Apply after both migrations in a test project.
-- Do not use these sample prices or menu as an organiser-approved event menu.
insert into public.stations(id,name) values ('00000000-0000-4000-8000-000000000003','Development coffee booth') on conflict do nothing;
insert into public.menu_items(id,name,price_cents,allowed_milk,allowed_temperatures)
values ('00000000-0000-4000-8000-000000000001','Sample Latte',550,array['dairy','oat'],array['hot','iced']) on conflict do nothing;
