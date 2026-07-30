import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Route, Switch, Redirect, useLocation, Router as WouterRouter } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import Home from '@/pages/Home';
import Products from '@/pages/Products';
import ProductDetail from '@/pages/ProductDetail';
import Cart from '@/pages/Cart';
import Checkout from '@/pages/Checkout';
import Orders from '@/pages/Orders';
import OrderDetail from '@/pages/OrderDetail';
import Account from '@/pages/Account';
import NotFound from '@/pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// REQUIRED — copy verbatim. Resolves the key from window.location.hostname so the
// same build serves multiple Clerk custom domains.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — empty in dev, auto-set in prod. Do not gate on PROD/NODE_ENV.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(217 91% 60%)',
    colorForeground: 'hsl(215 25% 15%)',
    colorMutedForeground: 'hsl(215 15% 45%)',
    colorDanger: 'hsl(0 84% 60%)',
    colorBackground: 'hsl(0 0% 100%)',
    colorInput: 'hsl(0 0% 100%)',
    colorInputForeground: 'hsl(215 25% 15%)',
    colorNeutral: 'hsl(215 25% 15%)',
    fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
    borderRadius: '4px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-lg w-[440px] max-w-full overflow-hidden shadow-lg border border-[hsl(214_20%_88%)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[hsl(215_25%_15%)] font-bold',
    headerSubtitle: 'text-[hsl(215_15%_45%)]',
    socialButtonsBlockButtonText: 'text-[hsl(215_25%_15%)] font-medium',
    formFieldLabel: 'text-[hsl(215_25%_20%)] font-medium',
    footerActionLink: 'text-[hsl(217_91%_60%)] font-medium hover:text-[hsl(217_91%_50%)]',
    footerActionText: 'text-[hsl(215_15%_45%)]',
    dividerText: 'text-[hsl(215_15%_45%)]',
    identityPreviewEditButton: 'text-[hsl(217_91%_60%)]',
    formFieldSuccessText: 'text-[hsl(142_71%_35%)]',
    alertText: 'text-[hsl(215_25%_15%)]',
    logoBox: 'justify-center',
    logoImage: 'h-10 w-auto',
    socialButtonsBlockButton: 'border border-[hsl(214_20%_82%)] hover:bg-[hsl(214_18%_95%)]',
    formButtonPrimary: 'bg-[hsl(217_91%_60%)] hover:bg-[hsl(217_91%_52%)] text-white font-semibold',
    formFieldInput: 'border border-[hsl(214_20%_82%)] bg-white text-[hsl(215_25%_15%)]',
    footerAction: 'justify-center',
    dividerLine: 'bg-[hsl(214_20%_88%)]',
    alert: 'border border-[hsl(214_20%_88%)]',
    otpCodeFieldInput: 'border border-[hsl(214_20%_82%)] text-[hsl(215_25%_15%)]',
    formFieldRow: 'gap-2',
    main: 'gap-6',
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function Protected({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

// Invalidate the query cache when the signed-in user changes.
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back',
            subtitle: 'Sign in to see your wholesale pricing',
          },
        },
        signUp: {
          start: {
            title: 'Create your shop account',
            subtitle: 'Register your repair shop for wholesale pricing',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/products">
              <Protected component={Products} />
            </Route>
            <Route path="/products/:id">
              <Protected component={ProductDetail} />
            </Route>
            <Route path="/cart">
              <Protected component={Cart} />
            </Route>
            <Route path="/checkout">
              <Protected component={Checkout} />
            </Route>
            <Route path="/orders">
              <Protected component={Orders} />
            </Route>
            <Route path="/orders/:id">
              <Protected component={OrderDetail} />
            </Route>
            <Route path="/account">
              <Protected component={Account} />
            </Route>
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
