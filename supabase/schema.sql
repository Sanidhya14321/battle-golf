create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null default 'Golfer', rating integer not null default 800,
 matches integer not null default 0, placements integer not null default 0,
 tokens integer not null default 0, owned jsonb not null default '["outfit-0","club-0","ball-0","hat-0","emote-0"]',
 equipment jsonb not null default '{}', highest_rating integer not null default 800,
 season integer not null default floor(extract(epoch from now()) / 7776000), updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (name,equipment) on public.profiles to authenticated;
create policy public_golf_profiles on public.profiles for select to anon, authenticated using (true);
create policy own_golf_profile on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create function public.new_golfer() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.profiles(id,name) values(new.id,'Golfer '||left(new.id::text,4));return new;end $$;
revoke all on function public.new_golfer() from public,anon,authenticated;
create trigger golfer_registered after insert on auth.users for each row execute function public.new_golfer();
create function public.valid_golf_equipment() returns trigger language plpgsql set search_path='' as $$ declare val text; begin
 for val in select jsonb_each_text.value from jsonb_each_text(new.equipment) loop
 if not new.owned ? val then raise exception 'Equip an unlocked cosmetic'; end if;
 end loop; new.name=left(new.name,20); return new; end $$;
create trigger validate_golf_equipment before update on public.profiles for each row execute function public.valid_golf_equipment();
create table public.matches(id text primary key,mode text not null,completed_at timestamptz not null default now());
create table public.match_results(match_id text references public.matches(id),user_id uuid references public.profiles(id),score integer not null,rating_change integer not null,primary key(match_id,user_id));
alter table public.matches enable row level security;alter table public.match_results enable row level security;
revoke all on public.matches,public.match_results from anon,authenticated;
create function public.finish_match(match_key text,match_mode text,entries jsonb) returns jsonb language plpgsql set search_path='' as $$
declare entry jsonb;season_number integer=floor(extract(epoch from now())/7776000);old_row public.profiles;begin
 if exists(select 1 from public.matches where id=match_key) then return '{"duplicate":true}';end if;
 insert into public.matches(id,mode) values(match_key,match_mode);
 for entry in select value from jsonb_array_elements(entries) loop
 select * into old_row from public.profiles where id=(entry->>'user_id')::uuid for update;
 if old_row.season<>season_number then
 update public.profiles set rating=round((rating+800)/2.0),season=season_number,placements=0,highest_rating=800,
 owned=case when highest_rating>=1600 then owned||'"hat-47"'::jsonb when highest_rating>=1400 then owned||'"hat-39"'::jsonb when highest_rating>=1200 then owned||'"hat-31"'::jsonb when highest_rating>=1000 then owned||'"hat-23"'::jsonb else owned||'"hat-15"'::jsonb end where id=old_row.id;
 end if;
 insert into public.match_results values(match_key,old_row.id,(entry->>'score')::integer,(entry->>'rating_change')::integer);
 update public.profiles set tokens=tokens+(entry->>'tokens')::integer,matches=matches+1,
 rating=greatest(0,rating+case when match_mode='ranked' then (entry->>'rating_change')::integer else 0 end),
 placements=placements+case when match_mode='ranked' then 1 else 0 end,highest_rating=greatest(highest_rating,rating+case when match_mode='ranked' then (entry->>'rating_change')::integer else 0 end),updated_at=now() where id=old_row.id;
 end loop;return '{"ok":true}';end $$;
revoke all on function public.finish_match(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_match(text,text,jsonb) to service_role;
create function public.unlock_cosmetic(who uuid,cosmetic_id text,price integer) returns jsonb language plpgsql set search_path='' as $$ declare p public.profiles;begin
 select * into p from public.profiles where id=who for update;
 if p.owned ? cosmetic_id then return '{"owned":true}';end if;
 if p.tokens<price or price<0 then raise exception 'Not enough clubhouse tokens';end if;
 update public.profiles set tokens=tokens-price,owned=owned||to_jsonb(cosmetic_id) where id=who;return '{"ok":true}';end $$;
revoke all on function public.unlock_cosmetic(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.unlock_cosmetic(uuid,text,integer) to service_role;
create schema golf_private;
create table golf_private.server_config(key text primary key,value text not null);
revoke all on schema golf_private from public,anon,authenticated;
grant usage on schema golf_private to service_role;
grant all on golf_private.server_config to service_role;
create function public.verify_golf_server(token text) returns boolean language sql set search_path='' as $$ select exists(select 1 from golf_private.server_config where key='server_token' and value=token) $$;
revoke all on function public.verify_golf_server(text) from public,anon,authenticated;
grant execute on function public.verify_golf_server(text) to service_role;
