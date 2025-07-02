import { useState, useEffect, useCallback } from "react";
import { useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  TextField,
  Banner,
  Link,
  InlineStack,
  Icon,
  Box,
  Divider,
  Spinner,
  Tabs,
  Badge,
  Modal,
  TextContainer,
} from "@shopify/polaris";
import {
  RefreshIcon,
  ExternalIcon,
  EmailIcon,
  ReplayIcon,
  DeleteIcon,
  BookIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Get subscription status
  const response = await admin.graphql(`
    query {
      appInstallation {
        activeSubscriptions {
          id
          name
          status
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
    }
  `);

  const data = await response.json();

  const subscriptions = data.data.appInstallation.activeSubscriptions;
  const isPro = subscriptions.some(
    (sub) =>
      sub.status === "ACTIVE" &&
      sub.lineItems[0]?.plan?.pricingDetails?.price?.amount > 0,
  );

  // Get access key from metafields
  const metafieldResponse = await admin.graphql(`
    query {
      shop {
        metafield(namespace: "voicero", key: "access_key") {
          value
        }
      }
    }
  `);

  const metafieldData = await metafieldResponse.json();
  const savedKey = metafieldData.data.shop.metafield?.value;

  let isConnected = false;
  if (savedKey) {
    try {
      const trimmedKey = savedKey.trim();
      const apiUrls = [`${urls.voiceroApi}/api/connect`];

      let connected = false;
      let responseData = null;

      for (const apiUrl of apiUrls) {
        try {
          const testResponse = await fetch(apiUrl, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${trimmedKey}`,
            },
            mode: "cors",
          });

          const responseText = await testResponse.text();

          try {
            const parsedData = JSON.parse(responseText);

            if (testResponse.ok && parsedData.website) {
              connected = true;
              responseData = parsedData;
              break;
            }
          } catch (e) {
            console.error(
              `Error parsing connection test response from ${apiUrl}:`,
              e,
            );
          }
        } catch (fetchError) {
          console.error(`Fetch error for ${apiUrl}:`, fetchError);
        }
      }

      isConnected = connected;
    } catch (error) {
      console.error("Error testing connection:", error);
      isConnected = false;
    }
  }

  return json({
    isPro,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    savedKey: isConnected ? savedKey : null,
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const accessKey = formData.get("accessKey");
  const action = formData.get("action");

  try {
    if (action === "manual_connect") {
      try {
        const trimmedKey = accessKey?.trim();

        if (!trimmedKey) {
          throw new Error("No access key provided");
        }

        const apiUrls = [`${urls.voiceroApi}/api/connect`];

        let connectionSuccessful = false;
        let connectionResponse = null;
        let connectionData = null;
        let connectionError = null;

        for (const apiUrl of apiUrls) {
          try {
            const response = await fetch(apiUrl, {
              method: "GET",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${trimmedKey}`,
              },
              mode: "cors",
            });

            const responseText = await response.text();

            try {
              const data = JSON.parse(responseText);

              if (response.ok && data.website) {
                connectionSuccessful = true;
                connectionResponse = response;
                connectionData = data;
                break;
              } else {
                connectionError = data.error || "Connection failed";
              }
            } catch (parseError) {
              console.error(
                `Error parsing response from ${apiUrl}:`,
                parseError,
              );
              connectionError = "Invalid response format";
            }
          } catch (fetchError) {
            console.error(`Fetch error for ${apiUrl}:`, fetchError);
            connectionError = fetchError.message;
          }
        }

        if (!connectionSuccessful) {
          throw new Error(
            connectionError ||
              "Connection failed. Please check your access key.",
          );
        }

        const data = connectionData;

        return {
          success: true,
          accessKey: accessKey,
          message: `Successfully connected to ${data.website?.name || "website"}!`,
          websiteData: data.website,
          namespace: data.website?.VectorDbConfig?.namespace || data.namespace,
        };
      } catch (error) {
        console.error("Manual connect error:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  } catch (error) {
    console.error("Action handler error:", error);
    let errorMessage = error.message;

    return {
      success: false,
      error: errorMessage,
    };
  }
};

// Fetch contacts from API
const fetchContacts = async () => {
  try {
    const response = await fetch("/api/contacts");
    const data = await response.json();
    console.log(data);

    if (data.success && data.contacts && data.contacts.contacts) {
      return data.contacts.contacts || [];
    } else {
      throw new Error(data.error || "Failed to fetch contacts");
    }
  } catch (error) {
    console.error("Error fetching contacts:", error);
    throw error;
  }
};

export default function Contact() {
  const { savedKey } = useLoaderData();
  const navigate = useNavigate();

  // State declarations
  const [accessKey, setAccessKey] = useState(savedKey || "");
  const [error, setError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);

  const fetcher = useFetcher();
  const app = useAppBridge();
  const isLoading = fetcher.state === "submitting";

  // Auto-connect when we have an access key
  useEffect(() => {
    if (accessKey && !fetcher.data?.success) {
      setIsDataLoading(true);
      fetcher.submit(
        { accessKey, action: "manual_connect" },
        { method: "POST" },
      );
    }
  }, [accessKey]);

  // Reset data loading state when we get data back from fetcher
  useEffect(() => {
    if (fetcher.data) {
      setIsDataLoading(false);
      setIsConnecting(false);
    }
  }, [fetcher.data]);

  // Load contacts when successfully connected
  useEffect(() => {
    if (accessKey && fetcher.data?.success) {
      handleLoadContacts();
    }
  }, [accessKey, fetcher.data?.success]);

  const handleLoadContacts = async () => {
    try {
      setIsLoadingContacts(true);
      setError(null);
      const contactsData = await fetchContacts();
      setContacts(Array.isArray(contactsData) ? contactsData : []);
    } catch (error) {
      console.error("Error loading contacts:", error);
      setError(`Failed to load contacts: ${error.message}`);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const handleMarkAsRead = async (contactId) => {
    try {
      const response = await fetch("/api/setReadContacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: contactId }),
      });

      if (response.ok) {
        // Update local state to reflect change
        setContacts(
          contacts.map((contact) =>
            contact.id === contactId ? { ...contact, read: true } : contact,
          ),
        );
      } else {
        console.error("Failed to mark contact as read");
        setError("Failed to mark contact as read");
      }
    } catch (error) {
      console.error("Error marking contact as read:", error);
      setError(`Error: ${error.message}`);
    }
  };

  const handleReply = async (contact) => {
    try {
      // Mark as replied in the API
      const response = await fetch("/api/setReplyContacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: contact.id }),
      });

      if (response.ok) {
        // Update local state
        setContacts(
          contacts.map((c) =>
            c.id === contact.id ? { ...c, replied: true } : c,
          ),
        );

        // Get the email address (either directly from contact or from user object)
        const emailAddress =
          contact.email || (contact.user && contact.user.email);

        if (emailAddress) {
          // Open email client with pre-filled details
          const subject = contact.subject
            ? `Re: ${contact.subject}`
            : "Re: Your message";
          const mailtoLink = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}`;
          window.open(mailtoLink);
        } else {
          setError("No email address found for this contact");
        }
      } else {
        console.error("Failed to mark contact as replied");
        setError("Failed to mark contact as replied");
      }
    } catch (error) {
      console.error("Error handling reply:", error);
      setError(`Error: ${error.message}`);
    }
  };

  const handleDeleteContact = async (contactId) => {
    try {
      const response = await fetch("/api/deleteContacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: contactId }),
      });

      if (response.ok) {
        // Remove from local state
        setContacts(contacts.filter((contact) => contact.id !== contactId));
      } else {
        console.error("Failed to delete contact");
        setError("Failed to delete contact");
      }
    } catch (error) {
      console.error("Error deleting contact:", error);
      setError(`Error: ${error.message}`);
    }
  };

  const getFilteredContacts = () => {
    switch (selectedTab) {
      case 0: // All
        return contacts;
      case 1: // Unread
        return contacts.filter((contact) => !contact.read);
      case 2: // Read
        return contacts.filter((contact) => contact.read);
      default:
        return contacts;
    }
  };

  const getPriorityColor = (priority) => {
    if (!priority) return "info";
    switch (priority) {
      case "high":
        return "critical";
      case "medium":
        return "warning";
      case "low":
        return "success";
      default:
        return "info";
    }
  };

  const formatTimestamp = (contact) => {
    // Handle both timestamp (from static data) and createdAt (from API)
    const date = contact.createdAt || contact.timestamp;
    return new Date(date).toLocaleString();
  };

  const unreadCount = contacts.filter((contact) => !contact.read).length;

  return (
    <Page>
      <Layout>
        <Layout.Section>
          {/* Header */}
          <Box paddingBlockEnd="600">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="200">
                <Text variant="headingXl" as="h1">
                  Customer Messages
                </Text>
                <Text variant="bodyMd" color="subdued">
                  Manage customer inquiries and support requests
                </Text>
              </BlockStack>
              {accessKey && fetcher.data?.success && (
                <Button
                  primary
                  size="large"
                  icon={ExternalIcon}
                  onClick={() => {
                    window.open(
                      `${urls.voiceroApi}/app/websites/website?id=${fetcher.data.websiteData.id}`,
                      "_blank",
                    );
                  }}
                >
                  Open Control Panel
                </Button>
              )}
            </InlineStack>
          </Box>

          {/* Error Messages */}
          {error && (
            <Box paddingBlockEnd="400">
              {typeof error === "string" ? (
                <div
                  style={{
                    backgroundColor: "#FFF5F5",
                    borderRadius: "12px",
                    padding: "16px",
                    border: "1px solid #FCE9E9",
                  }}
                >
                  <Text variant="bodyMd" tone="critical">
                    {error}
                  </Text>
                </div>
              ) : (
                error
              )}
            </Box>
          )}

          {/* Main Content */}
          <BlockStack gap="600">
            {accessKey ? (
              isDataLoading ? (
                /* Loading State */
                <div
                  style={{
                    backgroundColor: "white",
                    borderRadius: "12px",
                    padding: "80px",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                    textAlign: "center",
                  }}
                >
                  <BlockStack gap="400" align="center">
                    <Spinner size="large" />
                    <Text variant="headingMd" alignment="center">
                      Loading your messages...
                    </Text>
                    <Text variant="bodyMd" color="subdued" alignment="center">
                      This may take a few moments
                    </Text>
                  </BlockStack>
                </div>
              ) : fetcher.data?.success ? (
                /* Connected State */
                <BlockStack gap="600">
                  {/* Website Status Card */}
                  <div
                    style={{
                      backgroundColor: "white",
                      borderRadius: "12px",
                      padding: "24px",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                    }}
                  >
                    <BlockStack gap="600">
                      {/* Header Section */}
                      <InlineStack align="space-between" blockAlign="start">
                        <InlineStack gap="400" blockAlign="center">
                          <div
                            style={{
                              width: "48px",
                              height: "48px",
                              borderRadius: "12px",
                              backgroundColor: "#E3F5E1",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Icon source={EmailIcon} color="success" />
                          </div>
                          <BlockStack gap="100">
                            <Text variant="headingLg" fontWeight="semibold">
                              Message Center
                            </Text>
                            <Text variant="bodySm" color="subdued">
                              {fetcher.data.websiteData.name}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        <InlineStack gap="300" blockAlign="center">
                          <div
                            style={{
                              backgroundColor:
                                unreadCount > 0 ? "#FFF4E4" : "#E3F5E1",
                              padding: "6px 16px",
                              borderRadius: "20px",
                            }}
                          >
                            <Text
                              variant="bodySm"
                              fontWeight="semibold"
                              tone={unreadCount > 0 ? "caution" : "success"}
                            >
                              {unreadCount} Unread
                            </Text>
                          </div>
                        </InlineStack>
                      </InlineStack>

                      <Divider />

                      {/* Quick Stats Grid */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: "20px",
                        }}
                      >
                        <BlockStack gap="200">
                          <Text variant="bodySm" color="subdued">
                            Total Messages
                          </Text>
                          <Text variant="headingMd" fontWeight="semibold">
                            {contacts.length}
                          </Text>
                        </BlockStack>
                        <BlockStack gap="200">
                          <Text variant="bodySm" color="subdued">
                            Unread
                          </Text>
                          <Text
                            variant="headingMd"
                            fontWeight="semibold"
                            tone="caution"
                          >
                            {unreadCount}
                          </Text>
                        </BlockStack>
                        <BlockStack gap="200">
                          <Text variant="bodySm" color="subdued">
                            High Priority
                          </Text>
                          <Text
                            variant="headingMd"
                            fontWeight="semibold"
                            tone="critical"
                          >
                            {
                              contacts.filter((c) => c.priority === "high")
                                .length
                            }
                          </Text>
                        </BlockStack>
                        <BlockStack gap="200">
                          <Text variant="bodySm" color="subdued">
                            Response Rate
                          </Text>
                          <Text
                            variant="headingMd"
                            fontWeight="semibold"
                            tone="success"
                          >
                            {contacts.filter((c) => c.replied).length > 0
                              ? Math.round(
                                  (contacts.filter((c) => c.replied).length /
                                    contacts.length) *
                                    100,
                                ) + "%"
                              : "0%"}
                          </Text>
                        </BlockStack>
                      </div>
                    </BlockStack>
                  </div>

                  {/* Messages Card */}
                  <div
                    style={{
                      backgroundColor: "white",
                      borderRadius: "12px",
                      padding: "24px",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                    }}
                  >
                    <BlockStack gap="600">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="200">
                          <Text variant="headingLg" fontWeight="semibold">
                            Recent Messages
                          </Text>
                          <Text variant="bodyMd" color="subdued">
                            Customer inquiries and support requests
                          </Text>
                        </BlockStack>
                        <Button
                          icon={RefreshIcon}
                          loading={isLoadingContacts}
                          onClick={handleLoadContacts}
                        >
                          Refresh
                        </Button>
                      </InlineStack>

                      {/* Tabs */}
                      <Tabs
                        tabs={[
                          {
                            id: "all",
                            content: `All Messages (${contacts.length})`,
                          },
                          { id: "unread", content: `Unread (${unreadCount})` },
                          {
                            id: "read",
                            content: `Read (${contacts.length - unreadCount})`,
                          },
                        ]}
                        selected={selectedTab}
                        onSelect={setSelectedTab}
                      />

                      {/* Messages List */}
                      <div
                        style={{
                          backgroundColor: "#F9FAFB",
                          borderRadius: "12px",
                          padding: "16px",
                        }}
                      >
                        {isLoadingContacts ? (
                          <div style={{ padding: "40px", textAlign: "center" }}>
                            <BlockStack gap="400" align="center">
                              <Spinner size="large" />
                              <Text variant="headingMd" color="subdued">
                                Loading contacts...
                              </Text>
                            </BlockStack>
                          </div>
                        ) : (
                          <BlockStack gap="300">
                            {getFilteredContacts().map((contact) => (
                              <div
                                key={contact.id}
                                style={{
                                  backgroundColor: "white",
                                  borderRadius: "8px",
                                  padding: "20px",
                                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                                  border: contact.read
                                    ? "1px solid #E4E5E7"
                                    : "2px solid #5C6AC4",
                                }}
                              >
                                <BlockStack gap="400">
                                  {/* Header */}
                                  <InlineStack
                                    align="space-between"
                                    blockAlign="start"
                                  >
                                    <InlineStack gap="300" blockAlign="center">
                                      <div
                                        style={{
                                          width: "40px",
                                          height: "40px",
                                          borderRadius: "50%",
                                          backgroundColor: "#5C6AC4",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          color: "white",
                                          fontWeight: "bold",
                                          fontSize: "14px",
                                        }}
                                      >
                                        {contact.email &&
                                          contact.email.charAt(0).toUpperCase()}
                                      </div>
                                      <BlockStack gap="100">
                                        <InlineStack
                                          gap="200"
                                          blockAlign="center"
                                        >
                                          <Text
                                            variant="bodyMd"
                                            fontWeight="semibold"
                                          >
                                            {contact.email ||
                                              (contact.user &&
                                                contact.user.email) ||
                                              "Unknown"}
                                          </Text>
                                          {!contact.read && (
                                            <Badge status="info">New</Badge>
                                          )}
                                          {contact.priority && (
                                            <Badge
                                              status={getPriorityColor(
                                                contact.priority,
                                              )}
                                            >
                                              {(
                                                contact.priority || "NORMAL"
                                              ).toUpperCase()}
                                            </Badge>
                                          )}
                                        </InlineStack>
                                        <Text variant="bodySm" color="subdued">
                                          {formatTimestamp(contact)}
                                        </Text>
                                      </BlockStack>
                                    </InlineStack>
                                    <InlineStack gap="200">
                                      {!contact.read && (
                                        <Button
                                          size="slim"
                                          icon={BookIcon}
                                          onClick={() =>
                                            handleMarkAsRead(contact.id)
                                          }
                                        >
                                          Mark Read
                                        </Button>
                                      )}
                                      <Button
                                        size="slim"
                                        primary
                                        icon={ReplayIcon}
                                        onClick={() => handleReply(contact)}
                                      >
                                        Reply
                                      </Button>
                                      <Button
                                        size="slim"
                                        destructive
                                        icon={DeleteIcon}
                                        onClick={() =>
                                          handleDeleteContact(contact.id)
                                        }
                                      >
                                        Delete
                                      </Button>
                                    </InlineStack>
                                  </InlineStack>

                                  {/* Subject */}
                                  {contact.subject && (
                                    <Text
                                      variant="headingMd"
                                      fontWeight="semibold"
                                    >
                                      {contact.subject}
                                    </Text>
                                  )}

                                  {/* Message Preview */}
                                  <Text variant="bodyMd" color="subdued">
                                    {contact.message &&
                                    contact.message.length > 200
                                      ? `${contact.message.substring(0, 200)}...`
                                      : contact.message || "No message content"}
                                  </Text>
                                </BlockStack>
                              </div>
                            ))}

                            {getFilteredContacts().length === 0 && (
                              <div
                                style={{ padding: "40px", textAlign: "center" }}
                              >
                                <BlockStack gap="300" align="center">
                                  <Icon source={EmailIcon} color="subdued" />
                                  <Text variant="headingMd" color="subdued">
                                    No messages found
                                  </Text>
                                  <Text variant="bodyMd" color="subdued">
                                    {selectedTab === 1
                                      ? "All messages have been read"
                                      : selectedTab === 2
                                        ? "No read messages yet"
                                        : "No customer messages yet"}
                                  </Text>
                                </BlockStack>
                              </div>
                            )}
                          </BlockStack>
                        )}
                      </div>
                    </BlockStack>
                  </div>
                </BlockStack>
              ) : (
                /* Error State */
                <div
                  style={{
                    backgroundColor: "white",
                    borderRadius: "12px",
                    padding: "24px",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                  }}
                >
                  <Banner status="critical">
                    <p>
                      Unable to connect:{" "}
                      {fetcher.data?.error || "Please try again"}
                    </p>
                  </Banner>
                </div>
              )
            ) : (
              /* Connection Required */
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "12px",
                  padding: "48px",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                  textAlign: "center",
                }}
              >
                <BlockStack gap="600" align="center">
                  <div
                    style={{
                      width: "80px",
                      height: "80px",
                      borderRadius: "50%",
                      background:
                        "linear-gradient(135deg, #5C6AC4 0%, #202E78 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto",
                    }}
                  >
                    <Icon source={EmailIcon} color="base" />
                  </div>
                  <BlockStack gap="200" align="center">
                    <Text
                      variant="headingXl"
                      fontWeight="bold"
                      alignment="center"
                    >
                      Connect Your Account
                    </Text>
                    <Text variant="bodyLg" color="subdued" alignment="center">
                      Please connect your Voicero AI assistant to view customer
                      messages
                    </Text>
                  </BlockStack>
                  <Button primary size="large" onClick={() => navigate("/app")}>
                    Go to Dashboard
                  </Button>
                </BlockStack>
              </div>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
