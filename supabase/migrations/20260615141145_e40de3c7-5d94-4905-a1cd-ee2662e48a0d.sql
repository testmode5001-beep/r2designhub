
-- Enum para papéis
CREATE TYPE public.app_role AS ENUM ('gestor','vendedora','designer');

-- Enum para status de pedido
CREATE TYPE public.pedido_status AS ENUM ('nova','criacao','aguardando','revisao','aprovada','cliche','concluido','cancelado');

-- =========================
-- profiles
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================
-- user_roles
-- =========================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========================
-- has_role (security definer)
-- =========================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================
-- pedidos
-- =========================
CREATE TABLE public.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero SERIAL UNIQUE,
  vendedor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  designer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cliente TEXT NOT NULL,
  materia TEXT NOT NULL,
  larg_materia TEXT NOT NULL,
  largura TEXT NOT NULL,
  altura TEXT NOT NULL,
  forma TEXT NOT NULL,
  cores TEXT NOT NULL,
  cores_desc TEXT,
  descricao TEXT NOT NULL,
  link_ref TEXT,
  faca_url TEXT,
  faca_nome TEXT,
  status pedido_status NOT NULL DEFAULT 'nova',
  cliche_solicitado_em TIMESTAMPTZ,
  cliche_concluido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos TO authenticated;
GRANT ALL ON public.pedidos TO service_role;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

-- =========================
-- pedido_historico
-- =========================
CREATE TABLE public.pedido_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status pedido_status NOT NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pedido_historico TO authenticated;
GRANT ALL ON public.pedido_historico TO service_role;
ALTER TABLE public.pedido_historico ENABLE ROW LEVEL SECURITY;

-- =========================
-- pedido_anexos
-- =========================
CREATE TABLE public.pedido_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  url TEXT NOT NULL,
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.pedido_anexos TO authenticated;
GRANT ALL ON public.pedido_anexos TO service_role;
ALTER TABLE public.pedido_anexos ENABLE ROW LEVEL SECURITY;

-- =========================
-- Policies: profiles
-- =========================
CREATE POLICY "auth_select_profiles" ON public.profiles
FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "user_update_own_profile" ON public.profiles
FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "gestor_all_profiles" ON public.profiles
FOR ALL TO authenticated USING (public.has_role(auth.uid(),'gestor'))
WITH CHECK (public.has_role(auth.uid(),'gestor'));

-- =========================
-- Policies: user_roles
-- =========================
CREATE POLICY "auth_read_roles" ON public.user_roles
FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "gestor_manage_roles" ON public.user_roles
FOR ALL TO authenticated USING (public.has_role(auth.uid(),'gestor'))
WITH CHECK (public.has_role(auth.uid(),'gestor'));

-- =========================
-- Policies: pedidos
-- =========================
CREATE POLICY "vendedora_select_own" ON public.pedidos
FOR SELECT TO authenticated USING (
  vendedor_id = auth.uid()
  OR public.has_role(auth.uid(),'designer')
  OR public.has_role(auth.uid(),'gestor')
);
CREATE POLICY "vendedora_insert_own" ON public.pedidos
FOR INSERT TO authenticated WITH CHECK (
  vendedor_id = auth.uid()
  AND (public.has_role(auth.uid(),'vendedora') OR public.has_role(auth.uid(),'gestor'))
);
CREATE POLICY "designer_gestor_update" ON public.pedidos
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'designer')
  OR public.has_role(auth.uid(),'gestor')
  OR vendedor_id = auth.uid()
);
CREATE POLICY "gestor_delete" ON public.pedidos
FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'gestor'));

-- =========================
-- Policies: pedido_historico
-- =========================
CREATE POLICY "select_historico" ON public.pedido_historico
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
    AND (
      p.vendedor_id = auth.uid()
      OR public.has_role(auth.uid(),'designer')
      OR public.has_role(auth.uid(),'gestor')
    )
  )
);
CREATE POLICY "insert_historico" ON public.pedido_historico
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- =========================
-- Policies: pedido_anexos
-- =========================
CREATE POLICY "select_anexos" ON public.pedido_anexos
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
    AND (
      p.vendedor_id = auth.uid()
      OR public.has_role(auth.uid(),'designer')
      OR public.has_role(auth.uid(),'gestor')
    )
  )
);
CREATE POLICY "insert_anexos" ON public.pedido_anexos
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete_anexos" ON public.pedido_anexos
FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR public.has_role(auth.uid(),'gestor')
);

-- =========================
-- updated_at trigger
-- =========================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER set_updated_at_pedidos BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================
-- handle_new_user: cria profile + role vendedora ao se cadastrar
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'vendedora'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- Realtime
-- =========================
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedido_historico;
