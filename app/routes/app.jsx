import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  // Define custom theme for Polaris v12
  const customTheme = {
    colors: {
      surface: {
        selected: "rgba(136, 43, 230, 0.1)",
        hovered: "rgba(136, 43, 230, 0.05)",
      },
      interactive: "#882be6",
      primary: "#882be6",
      critical: "#d82c0d",
      warning: "#ffc453",
      highlight: "#882be6",
      success: "#008060",
      decorative: "#882be6",
    },
  };

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <PolarisAppProvider i18n={{}} theme={customTheme}>
        <NavMenu>
          <Link to="/app" rel="home">
            Home
          </Link>
          <Link to="/app/ai-overview">AI Overview</Link>
          <Link to="/app/customize-chatbot">Customize Chatbot</Link>
          <Link to="/app/contacts">Contacts</Link>
          <Link to="/app/settings">Settings</Link>
        </NavMenu>
        <Outlet />
      </PolarisAppProvider>
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
