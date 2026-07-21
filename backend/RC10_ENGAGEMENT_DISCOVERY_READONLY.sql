-- RC10 · consulta exclusivamente de lectura. No crea ni modifica objetos.
select command_type, entity_type, event_name, allowed_roles, requires_reason, requires_preview, enabled
from public.domain_command_registry_v26
where command_type in (
  'CHECKIN_REGISTRAR','CHECKIN_ANULAR','HABITO_DEFINIR','HABITO_REGISTRAR','HABITO_ARCHIVAR',
  'NOTA_PRIVADA_CREAR','NOTA_PRIVADA_ACTUALIZAR','NOTA_PRIVADA_ARCHIVAR'
)
order by command_type;

select table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('client_checkins_v26','client_habits_v26','client_habit_logs_v26','coach_private_notes_v26')
order by table_name;
