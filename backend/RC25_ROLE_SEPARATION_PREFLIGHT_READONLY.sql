-- RC25 · comprobación de separación real por rol (SOLO LECTURA)
-- No modifica producción. Debe ejecutarse autenticado en el canario antes de desplegar.
select current_user as database_role, auth.uid() as authenticated_user;

-- Las funciones de bootstrap deben usar auth.uid(), nunca un client_id recibido del navegador.
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('iberfit_bootstrap_v26','iberfit_command_preflight_v26','iberfit_execute_command_v26');

-- Inventario de RLS y políticas. El gate remoto debe comprobar que RLS está habilitado
-- en todas las tablas leídas por bootstrap y que no existen políticas anon permisivas.
select c.relname as table_name,c.relrowsecurity,c.relforcerowsecurity,
       pol.polname,pol.polpermissive,pol.polroles,pg_get_expr(pol.polqual,pol.polrelid) as using_expression,
       pg_get_expr(pol.polwithcheck,pol.polrelid) as check_expression
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
left join pg_policy pol on pol.polrelid=c.oid
where n.nspname='public' and c.relkind='r'
order by c.relname,pol.polname;

-- Resultado esperado del ensayo con cuenta Cliente:
-- 0 notas privadas, 0 propuestas IA, 0 eventos internos, 0 disponibilidad Coach,
-- 0 sesiones/planes/informes no publicados y 0 registros de otros clientes.
