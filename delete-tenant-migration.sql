-- Execute in the Supabase SQL editor before deploying the permanent deletion endpoint.
-- One transaction: any foreign-key error rolls back the entire deletion.
create or replace function public.delete_tenant_permanently(target_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_id is null or target_id = 'tenant-demo' then
    raise exception 'Protected tenant';
  end if;
  perform 1 from public.tenants where id = target_id for update;
  if not found then raise exception 'Tenant not found'; end if;
  delete from public.sale_items where tenant_id = target_id;
  delete from public.sales where tenant_id = target_id;
  delete from public.factory_quality_checks where tenant_id = target_id;
  delete from public.intervention_photos where intervention_id in (select id from public.interventions where tenant_id = target_id);
  delete from public.interventions where tenant_id = target_id;
  delete from public.stock_movements where tenant_id = target_id;
  delete from public.poles where tenant_id = target_id;
  delete from public.projects where tenant_id = target_id;
  delete from public.production_orders where tenant_id = target_id;
  delete from public.clients where tenant_id = target_id;
  delete from public.audit_log where tenant_id = target_id;
  delete from public.platform_audit_logs where target_tenant_id = target_id or actor_id in (select id from public.app_users where tenant_id = target_id);
  delete from public.activation_emails where tenant_id = target_id;
  delete from public.transactions where tenant_id = target_id;
  delete from public.subscriptions where tenant_id = target_id;
  delete from public.tenant_limits where tenant_id = target_id;
  delete from public.app_users where tenant_id = target_id;
  delete from public.tenants where id = target_id;
end;
$$;
revoke all on function public.delete_tenant_permanently(text) from public, anon, authenticated;
grant execute on function public.delete_tenant_permanently(text) to service_role;
