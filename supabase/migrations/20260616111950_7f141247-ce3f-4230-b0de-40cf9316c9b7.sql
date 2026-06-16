
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.app_role;
  v_is_first boolean;
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)));

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_is_first;

  IF v_is_first THEN
    v_role := 'gestor';
  ELSE
    v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'vendedora');
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role);

  RETURN NEW;
END;
$function$;

-- Garantir que o trigger existe em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Se já existe um usuário cadastrado e ninguém é gestor, promover o mais antigo
DO $$
DECLARE
  v_first_user uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'gestor') THEN
    SELECT id INTO v_first_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
    IF v_first_user IS NOT NULL THEN
      DELETE FROM public.user_roles WHERE user_id = v_first_user;
      INSERT INTO public.user_roles (user_id, role) VALUES (v_first_user, 'gestor');
    END IF;
  END IF;
END $$;
