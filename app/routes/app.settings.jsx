import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Get the access key from metafields
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
  const accessKey = metafieldData.data.shop.metafield?.value;

  if (!accessKey) {
    return json({
      disconnected: true,
      error: "No access key found",
    });
  }

  try {
    // Fetch website data from the connect API
    const response = await fetch(`${urls.voiceroApi}/api/connect`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    if (!response.ok) {
      return json({
        error: "Failed to fetch website data",
      });
    }

    const data = await response.json();
    if (!data.website) {
      return json({
        error: "No website data found",
      });
    }

    return json({
      websiteData: data.website,
      accessKey,
    });
  } catch (error) {
    return json({
      error: error.message || "Failed to fetch website data",
    });
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  // Get access key from metafields
  const metafieldResponse = await admin.graphql(`
    query {
      shop {
        metafield(namespace: "voicero", key: "access_key") {
          id
          value
        }
      }
    }
  `);

  const metafieldData = await metafieldResponse.json();
  const accessKey = metafieldData.data.shop.metafield?.value;
  const metafieldId = metafieldData.data.shop.metafield?.id;

  if (!accessKey && action !== "disconnect") {
    return json({
      success: false,
      error: "Access key not found",
    });
  }

  try {
    if (action === "update") {
      // Parse the form data
      const active = formData.get("active") === "true";
      const name = formData.get("name");
      const url = formData.get("url");
      const customInstructions = formData.get("customInstructions");

      // Prepare the update payload
      const updates = {
        name,
        url,
        customInstructions,
        active,
      };

      // Call the editInfoFromShopify API
      const response = await fetch(
        `http://localhost:3000/api/shopify/editInfoFromShopify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
          body: JSON.stringify(updates),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update settings");
      }

      const data = await response.json();
      return json({
        success: true,
        data: data.website,
        message: "Settings updated successfully!",
      });
    } else if (action === "disconnect") {
      // Use our API endpoint to delete the access key
      try {
        // Get the URL origin from the current request
        const url = new URL(request.url);
        const baseUrl = url.origin;

        // Use a fully qualified URL for server-side fetch with proper error handling
        const response = await fetch(`${baseUrl}/api/accessKey`, {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        });

        await response.json();
      } catch (error) {
        // Continue with disconnect process even if API call fails
      }

      return json({
        success: true,
        disconnected: true,
        message: "Successfully disconnected from VoiceroAI",
      });
    }
  } catch (error) {
    return json({
      success: false,
      error: error.message || "Operation failed",
    });
  }
};

export default function SettingsPage() {
  const { websiteData, accessKey, error, disconnected } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [isEditingAuto, setIsEditingAuto] = useState(false);
  const [formData, setFormData] = useState({
    name: websiteData?.name || "",
    url: websiteData?.url || "",
    customInstructions: websiteData?.customInstructions || "",
    active: websiteData?.active || false,
  });

  // Auto features state
  const [autoFeatures, setAutoFeatures] = useState({
    allowAutoRedirect: websiteData
      ? websiteData.allowAutoRedirect === true
      : false,
    allowAutoScroll: websiteData ? websiteData.allowAutoScroll === true : false,
    allowAutoHighlight: websiteData
      ? websiteData.allowAutoHighlight === true
      : false,
    allowAutoClick: websiteData ? websiteData.allowAutoClick === true : false,
    allowAutoCancel: websiteData ? websiteData.allowAutoCancel === true : false,
    allowAutoReturn: websiteData ? websiteData.allowAutoReturn === true : false,
    allowAutoExchange: websiteData
      ? websiteData.allowAutoExchange === true
      : false,
    allowAutoGetUserOrders: websiteData
      ? websiteData.allowAutoGetUserOrders === true
      : false,
    allowAutoUpdateUserInfo: websiteData
      ? websiteData.allowAutoUpdateUserInfo === true
      : false,
    allowAutoFillForm: websiteData
      ? websiteData.allowAutoFillForm !== false
      : true,
    allowAutoTrackOrder: websiteData
      ? websiteData.allowAutoTrackOrder !== false
      : true,
    allowAutoLogout: websiteData ? websiteData.allowAutoLogout !== false : true,
    allowAutoLogin: websiteData ? websiteData.allowAutoLogin !== false : true,
    allowAutoGenerateImage: websiteData
      ? websiteData.allowAutoGenerateImage !== false
      : true,
  });

  // User data state
  const [userData, setUserData] = useState({
    name: "",
    username: "",
    email: "",
  });

  const [userDataLoading, setUserDataLoading] = useState(true);
  const [userDataError, setUserDataError] = useState(null);

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  // Fetch user data from the API
  useEffect(() => {
    if (accessKey) {
      setUserDataLoading(true);
      fetch("/api/user/me")
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to fetch user data");
          }
          return response.json();
        })
        .then((data) => {
          if (data.user) {
            setUserData({
              name: data.user.name || "",
              username: data.user.username || "",
              email: data.user.email || "",
            });
          }
          setUserDataLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching user data:", err);
          setUserDataError(err.message);
          setUserDataLoading(false);
        });
    }
  }, [accessKey]);

  // Add CSS styles
  const styles = {
    container: {
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "20px",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "20px",
    },
    title: {
      fontSize: "24px",
      fontWeight: "bold",
      margin: 0,
    },
    backButton: {
      padding: "8px 16px",
      backgroundColor: "#f1f1f1",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
    },
    badge: {
      padding: "4px 8px",
      borderRadius: "4px",
      fontSize: "12px",
      fontWeight: "bold",
      color: "white",
      backgroundColor: websiteData?.active ? "#008060" : "#d82c0d",
    },
    card: {
      backgroundColor: "white",
      borderRadius: "8px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      padding: "20px",
      marginBottom: "20px",
    },
    cardHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "15px",
    },
    cardTitle: {
      fontSize: "16px",
      fontWeight: "bold",
      margin: 0,
    },
    divider: {
      height: "1px",
      backgroundColor: "#e1e3e5",
      margin: "15px 0",
    },
    infoRow: {
      display: "flex",
      alignItems: "flex-start",
      marginBottom: "10px",
    },
    label: {
      fontWeight: "bold",
      marginRight: "8px",
      width: "100px",
    },
    inputField: {
      width: "100%",
      padding: "8px 12px",
      border: "1px solid #c9cccf",
      borderRadius: "4px",
      fontSize: "14px",
    },
    textArea: {
      width: "100%",
      padding: "8px 12px",
      border: "1px solid #c9cccf",
      borderRadius: "4px",
      fontSize: "14px",
      minHeight: "100px",
    },
    button: {
      padding: "8px 16px",
      backgroundColor: "#008060",
      color: "white",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px",
    },
    secondaryButton: {
      padding: "8px 16px",
      backgroundColor: "white",
      border: "1px solid #c9cccf",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px",
      marginRight: "8px",
    },
    destructiveButton: {
      padding: "8px 16px",
      backgroundColor: "#d82c0d",
      color: "white",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "14px",
    },
    toast: {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      padding: "16px 20px",
      backgroundColor: showToast
        ? toastType === "critical"
          ? "#fedfe2"
          : "#e2f5e7"
        : "transparent",
      color: toastType === "critical" ? "#d82c0d" : "#008060",
      borderRadius: "8px",
      boxShadow: "0 0 10px rgba(0,0,0,0.1)",
      zIndex: 9999,
      display: showToast ? "flex" : "none",
      alignItems: "center",
      justifyContent: "space-between",
      maxWidth: "400px",
    },
    modal: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      zIndex: 1000,
      display: showDisconnectModal ? "flex" : "none",
      alignItems: "center",
      justifyContent: "center",
    },
    modalContent: {
      backgroundColor: "white",
      borderRadius: "8px",
      padding: "20px",
      maxWidth: "500px",
      width: "90%",
    },
    modalHeader: {
      fontSize: "18px",
      fontWeight: "bold",
      marginBottom: "15px",
    },
    modalActions: {
      display: "flex",
      justifyContent: "flex-end",
      marginTop: "20px",
    },
    progressBar: {
      width: "100%",
      height: "4px",
      backgroundColor: "#f5f5f5",
      borderRadius: "2px",
      overflow: "hidden",
      position: "relative",
    },
    progressBarInner: {
      position: "absolute",
      width: "30%",
      height: "100%",
      backgroundColor: "#008060",
      borderRadius: "2px",
      animation: "loading 1.5s infinite ease-in-out",
      left: "-30%",
    },
    featureRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 0",
      borderBottom: "1px solid #f1f1f1",
    },
    featureLabel: {
      flex: 1,
      fontSize: "14px",
    },
    featureToggle: {
      marginLeft: "16px",
    },
    checkbox: {
      transform: "scale(1.2)",
      cursor: "pointer",
    },
  };

  const handleSave = () => {
    // Create a copy of formData without including lastSyncedAt
    const dataToSubmit = {
      action: "update",
      name: formData.name,
      url: formData.url,
      customInstructions: formData.customInstructions,
      active: formData.active.toString(),
    };

    fetcher.submit(dataToSubmit, { method: "POST" });
    setIsEditing(false);
    setShowToast(true);
    setToastMessage("Settings updated successfully!");
    setToastType("success");
  };

  const toggleStatus = async () => {
    try {
      // Call the toggle-status API
      const response = await fetch(
        `http://localhost:3000/api/websites/toggle-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
          body: JSON.stringify({ accessKey }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to toggle status");
      }

      const data = await response.json();

      // Update the local state based on the response
      setFormData({
        ...formData,
        active: data.status === "active",
      });

      setShowToast(true);
      setToastMessage(
        `AI Assistant ${data.status === "active" ? "activated" : "deactivated"} successfully!`,
      );
      setToastType("success");
    } catch (error) {
      console.error("Error toggling status:", error);
      setShowToast(true);
      setToastMessage(error.message || "Failed to toggle status");
      setToastType("critical");
    }
  };

  const handleDisconnect = () => {
    setShowDisconnectModal(false);

    fetch("/api/accessKey", {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          return { success: false, error: "HTTP error" };
        }
        return response.json().catch(() => ({
          success: false,
          error: "JSON parse error",
        }));
      })
      .finally(() => {
        fetcher.submit({ action: "disconnect" }, { method: "POST" });
        setTimeout(() => {
          navigate("/app");
        }, 2000);
      });
  };

  const toggleToast = () => setShowToast(!showToast);

  // Redirect if disconnected
  useEffect(() => {
    if (disconnected) {
      navigate("/app");
    }
  }, [disconnected, navigate]);

  // Handle form data from action
  useEffect(() => {
    if (fetcher.data?.disconnected) {
      navigate("/app");
    } else if (fetcher.data?.error) {
      setShowToast(true);
      setToastMessage(fetcher.data.error);
      setToastType("critical");
    } else if (fetcher.data?.success) {
      // Update form data with the new data from the server
      if (fetcher.data.data) {
        // Update website information
        setFormData({
          name: fetcher.data.data.name || "",
          url: fetcher.data.data.url || "",
          customInstructions: fetcher.data.data.customInstructions || "",
          active: fetcher.data.data.active || false,
        });

        // Update auto features if they are part of the response
        if (fetcher.data.data.autoFeatures) {
          setAutoFeatures({
            allowAutoRedirect:
              fetcher.data.data.autoFeatures.allowAutoRedirect === true,
            allowAutoScroll:
              fetcher.data.data.autoFeatures.allowAutoScroll === true,
            allowAutoHighlight:
              fetcher.data.data.autoFeatures.allowAutoHighlight === true,
            allowAutoClick:
              fetcher.data.data.autoFeatures.allowAutoClick === true,
            allowAutoCancel:
              fetcher.data.data.autoFeatures.allowAutoCancel === true,
            allowAutoReturn:
              fetcher.data.data.autoFeatures.allowAutoReturn === true,
            allowAutoExchange:
              fetcher.data.data.autoFeatures.allowAutoExchange === true,
            allowAutoGetUserOrders:
              fetcher.data.data.autoFeatures.allowAutoGetUserOrders === true,
            allowAutoUpdateUserInfo:
              fetcher.data.data.autoFeatures.allowAutoUpdateUserInfo === true,
            allowAutoFillForm:
              fetcher.data.data.autoFeatures.allowAutoFillForm !== false,
            allowAutoTrackOrder:
              fetcher.data.data.autoFeatures.allowAutoTrackOrder !== false,
            allowAutoLogout:
              fetcher.data.data.autoFeatures.allowAutoLogout !== false,
            allowAutoLogin:
              fetcher.data.data.autoFeatures.allowAutoLogin !== false,
            allowAutoGenerateImage:
              fetcher.data.data.autoFeatures.allowAutoGenerateImage !== false,
          });
        }
      }

      setShowToast(true);
      setToastMessage(
        fetcher.data.message || "Operation completed successfully",
      );
      setToastType("success");
    }
  }, [fetcher.data, navigate]);

  const handleSaveUserSettings = async () => {
    try {
      setIsEditingUser(false);

      const response = await fetch("/api/updateUserSettings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: userData.name,
          username: userData.username,
          email: userData.email,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setShowToast(true);
        setToastMessage("User settings updated successfully!");
        setToastType("success");
      } else {
        throw new Error(data.error || "Failed to update user settings");
      }
    } catch (error) {
      console.error("Error updating user settings:", error);
      setShowToast(true);
      setToastMessage(error.message || "Failed to update user settings");
      setToastType("critical");
    }
  };

  const handleSaveAutoFeatures = async () => {
    try {
      setIsEditingAuto(false);

      // Ensure all auto features are explicitly set as booleans
      const featuresPayload = {
        allowAutoRedirect: !!autoFeatures.allowAutoRedirect,
        allowAutoScroll: !!autoFeatures.allowAutoScroll,
        allowAutoHighlight: !!autoFeatures.allowAutoHighlight,
        allowAutoClick: !!autoFeatures.allowAutoClick,
        allowAutoCancel: !!autoFeatures.allowAutoCancel,
        allowAutoReturn: !!autoFeatures.allowAutoReturn,
        allowAutoExchange: !!autoFeatures.allowAutoExchange,
        allowAutoGetUserOrders: !!autoFeatures.allowAutoGetUserOrders,
        allowAutoUpdateUserInfo: !!autoFeatures.allowAutoUpdateUserInfo,
        allowAutoFillForm: !!autoFeatures.allowAutoFillForm,
        allowAutoTrackOrder: !!autoFeatures.allowAutoTrackOrder,
        allowAutoLogout: !!autoFeatures.allowAutoLogout,
        allowAutoLogin: !!autoFeatures.allowAutoLogin,
        allowAutoGenerateImage: !!autoFeatures.allowAutoGenerateImage,
      };

      console.log("Sending auto features:", featuresPayload);

      const response = await fetch("/api/updateWebsiteAutos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(featuresPayload),
      });

      const data = await response.json();

      if (data.success) {
        setShowToast(true);
        setToastMessage("AI auto features updated successfully!");
        setToastType("success");
      } else {
        throw new Error(data.error || "Failed to update AI auto features");
      }
    } catch (error) {
      console.error("Error updating AI auto features:", error);
      setShowToast(true);
      setToastMessage(error.message || "Failed to update AI auto features");
      setToastType("critical");
    }
  };

  const toggleAutoFeature = (feature) => {
    setAutoFeatures({
      ...autoFeatures,
      [feature]: !autoFeatures[feature],
    });
  };

  if (disconnected) {
    return null; // Don't render anything while redirecting
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div
          style={{
            ...styles.card,
            backgroundColor: "#fedfe2",
            color: "#d82c0d",
          }}
        >
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => navigate("/app")}>
          Back
        </button>
        <h1 style={styles.title}>Website Settings</h1>
        <span style={styles.badge}>
          {websiteData?.active ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Connection Settings */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Connection Settings</h2>
        </div>
        <div style={styles.divider}></div>
        <div style={styles.infoRow}>
          <span style={styles.label}>Access Key:</span>
          <span
            style={{
              padding: "4px 8px",
              backgroundColor: "#f6f6f7",
              borderRadius: "4px",
            }}
          >
            {accessKey}
          </span>
        </div>
        <div style={styles.infoRow}>
          <span style={{ width: "100px" }}></span>
          <div>
            <button
              style={{ ...styles.destructiveButton, marginRight: "10px" }}
              onClick={() => setShowDisconnectModal(true)}
            >
              Disconnect Website
            </button>
            <button
              style={styles.destructiveButton}
              onClick={() =>
                window.open("https://www.voicero.ai/app/settings", "_blank")
              }
            >
              Delete Website
            </button>
          </div>
        </div>
      </div>

      {/* Website Information */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Website Information</h2>
          {isEditing ? (
            <div>
              <button
                style={styles.secondaryButton}
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </button>
              <button style={styles.button} onClick={handleSave}>
                Save Changes
              </button>
            </div>
          ) : (
            <button
              style={styles.secondaryButton}
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
          )}
        </div>
        <div style={styles.divider}></div>
        <div style={styles.infoRow}>
          <span style={styles.label}>Status:</span>
          <div>
            <span
              style={{
                padding: "4px 8px",
                borderRadius: "4px",
                backgroundColor: formData.active ? "#e2f5e7" : "#fedfe2",
                color: formData.active ? "#008060" : "#d82c0d",
                marginRight: "10px",
              }}
            >
              {formData.active ? "Active" : "Inactive"}
            </span>
            <button style={styles.secondaryButton} onClick={toggleStatus}>
              {formData.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        </div>
        <div style={styles.infoRow}>
          <label style={styles.label}>Website Name:</label>
          <input
            type="text"
            style={styles.inputField}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            disabled={!isEditing}
          />
        </div>
        <div style={styles.infoRow}>
          <label style={styles.label}>Website URL:</label>
          <input
            type="text"
            style={styles.inputField}
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            disabled={!isEditing}
          />
        </div>
        <div style={styles.infoRow}>
          <label style={styles.label}>Custom Instructions:</label>
          <textarea
            style={styles.textArea}
            value={formData.customInstructions}
            onChange={(e) =>
              setFormData({ ...formData, customInstructions: e.target.value })
            }
            disabled={!isEditing}
          />
        </div>
      </div>

      {/* User Settings */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>User Settings</h2>
          {isEditingUser ? (
            <div>
              <button
                style={styles.secondaryButton}
                onClick={() => setIsEditingUser(false)}
              >
                Cancel
              </button>
              <button style={styles.button} onClick={handleSaveUserSettings}>
                Save Changes
              </button>
            </div>
          ) : (
            <button
              style={styles.secondaryButton}
              onClick={() => setIsEditingUser(true)}
              disabled={userDataLoading}
            >
              Edit
            </button>
          )}
        </div>
        <div style={styles.divider}></div>

        {userDataLoading ? (
          <div style={styles.progressBar}>
            <div style={styles.progressBarInner}></div>
            <style>{`
              @keyframes loading {
                0% { transform: translateX(0); }
                100% { transform: translateX(433%); }
              }
            `}</style>
          </div>
        ) : userDataError ? (
          <div
            style={{
              padding: "10px",
              backgroundColor: "#fedfe2",
              color: "#d82c0d",
              borderRadius: "4px",
            }}
          >
            <p>Failed to load user data: {userDataError}</p>
          </div>
        ) : (
          <>
            <div style={styles.infoRow}>
              <label style={styles.label}>Name:</label>
              <input
                type="text"
                style={styles.inputField}
                value={userData.name}
                onChange={(e) =>
                  setUserData({ ...userData, name: e.target.value })
                }
                disabled={!isEditingUser}
              />
            </div>
            <div style={styles.infoRow}>
              <label style={styles.label}>Username:</label>
              <input
                type="text"
                style={styles.inputField}
                value={userData.username}
                onChange={(e) =>
                  setUserData({ ...userData, username: e.target.value })
                }
                disabled={!isEditingUser}
              />
            </div>
            <div style={styles.infoRow}>
              <label style={styles.label}>Email:</label>
              <input
                type="email"
                style={styles.inputField}
                value={userData.email}
                onChange={(e) =>
                  setUserData({ ...userData, email: e.target.value })
                }
                disabled={!isEditingUser}
              />
            </div>
          </>
        )}
      </div>

      {/* AI Auto Features */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>AI Auto Features</h2>
          {isEditingAuto ? (
            <div>
              <button
                style={styles.secondaryButton}
                onClick={() => setIsEditingAuto(false)}
              >
                Cancel
              </button>
              <button style={styles.button} onClick={handleSaveAutoFeatures}>
                Save Changes
              </button>
            </div>
          ) : (
            <button
              style={styles.secondaryButton}
              onClick={() => setIsEditingAuto(true)}
            >
              Edit
            </button>
          )}
        </div>
        <div style={styles.divider}></div>

        <div style={{ marginBottom: "20px" }}>
          <p
            style={{ fontSize: "14px", color: "#637381", marginBottom: "16px" }}
          >
            Control which automated actions your AI assistant can perform.
            Disabling certain features may limit functionality.
          </p>

          <div
            style={{
              padding: "12px",
              backgroundColor: "#FFF4E4",
              borderRadius: "8px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ color: "#C05717" }}>⚠️</span>
            <p style={{ fontSize: "13px", color: "#C05717", margin: 0 }}>
              Disabling these features will significantly reduce the
              effectiveness of your AI assistant.
            </p>
          </div>
        </div>

        <h3
          style={{ fontSize: "16px", fontWeight: "600", marginBottom: "16px" }}
        >
          Critical Features
        </h3>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>
              Allow AI to automatically redirect users to relevant pages
            </span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={autoFeatures.allowAutoRedirect}
              onChange={() => toggleAutoFeature("allowAutoRedirect")}
              disabled={!isEditingAuto}
            />
          </div>
        </div>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>Allow AI to scroll to relevant sections on the page</span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={autoFeatures.allowAutoScroll}
              onChange={() => toggleAutoFeature("allowAutoScroll")}
              disabled={!isEditingAuto}
            />
          </div>
        </div>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>Allow AI to highlight important elements on the page</span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={autoFeatures.allowAutoHighlight}
              onChange={() => toggleAutoFeature("allowAutoHighlight")}
              disabled={!isEditingAuto}
            />
          </div>
        </div>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>Allow AI to click buttons and links on behalf of users</span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={autoFeatures.allowAutoClick}
              onChange={() => toggleAutoFeature("allowAutoClick")}
              disabled={!isEditingAuto}
            />
          </div>
        </div>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>Allow AI to automatically fill forms for users</span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={autoFeatures.allowAutoFillForm}
              onChange={() => toggleAutoFeature("allowAutoFillForm")}
              disabled={!isEditingAuto}
            />
          </div>
        </div>

        <h3
          style={{ fontSize: "16px", fontWeight: "600", margin: "24px 0 16px" }}
        >
          Order Features
        </h3>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>Allow AI to help users cancel orders</span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={autoFeatures.allowAutoCancel}
              onChange={() => toggleAutoFeature("allowAutoCancel")}
              disabled={!isEditingAuto}
            />
          </div>
        </div>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>Allow AI to help users return products</span>
            <span
              style={{
                marginLeft: "8px",
                padding: "2px 6px",
                backgroundColor: "#f1f1f1",
                color: "#637381",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: "bold",
              }}
            >
              Coming Soon
            </span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={{
                ...styles.checkbox,
                opacity: 0.5,
                cursor: "not-allowed",
              }}
              checked={false}
              disabled={true}
            />
          </div>
        </div>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>Allow AI to help users exchange products</span>
            <span
              style={{
                marginLeft: "8px",
                padding: "2px 6px",
                backgroundColor: "#f1f1f1",
                color: "#637381",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: "bold",
              }}
            >
              Coming Soon
            </span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={{
                ...styles.checkbox,
                opacity: 0.5,
                cursor: "not-allowed",
              }}
              checked={false}
              disabled={true}
            />
          </div>
        </div>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>Allow AI to help users track their orders</span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={autoFeatures.allowAutoTrackOrder}
              onChange={() => toggleAutoFeature("allowAutoTrackOrder")}
              disabled={!isEditingAuto}
            />
          </div>
        </div>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>Allow AI to fetch and display user order history</span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={autoFeatures.allowAutoGetUserOrders}
              onChange={() => toggleAutoFeature("allowAutoGetUserOrders")}
              disabled={!isEditingAuto}
            />
          </div>
        </div>

        <h3
          style={{ fontSize: "16px", fontWeight: "600", margin: "24px 0 16px" }}
        >
          User Data Features
        </h3>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>Allow AI to help users update their account information</span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={autoFeatures.allowAutoUpdateUserInfo}
              onChange={() => toggleAutoFeature("allowAutoUpdateUserInfo")}
              disabled={!isEditingAuto}
            />
          </div>
        </div>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>Allow AI to help users log out</span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={autoFeatures.allowAutoLogout}
              onChange={() => toggleAutoFeature("allowAutoLogout")}
              disabled={!isEditingAuto}
            />
          </div>
        </div>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>Allow AI to help users log in</span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={autoFeatures.allowAutoLogin}
              onChange={() => toggleAutoFeature("allowAutoLogin")}
              disabled={!isEditingAuto}
            />
          </div>
        </div>

        <h3
          style={{ fontSize: "16px", fontWeight: "600", margin: "24px 0 16px" }}
        >
          Content Generation Features
        </h3>

        <div style={styles.featureRow}>
          <div style={styles.featureLabel}>
            <span>Allow AI to generate images for users</span>
            <span
              style={{
                marginLeft: "8px",
                padding: "2px 6px",
                backgroundColor: "#f1f1f1",
                color: "#637381",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: "bold",
              }}
            >
              Coming Soon
            </span>
          </div>
          <div style={styles.featureToggle}>
            <input
              type="checkbox"
              style={{
                ...styles.checkbox,
                opacity: 0.5,
                cursor: "not-allowed",
              }}
              checked={false}
              disabled={true}
            />
          </div>
        </div>
      </div>

      {/* Subscription Information */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Subscription Information</h2>
        </div>
        <div style={styles.divider}></div>
        <div style={styles.infoRow}>
          <span style={styles.label}>Current Plan:</span>
          <span
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              backgroundColor: "#f6f6f7",
            }}
          >
            {websiteData.plan || "Free"}
          </span>
        </div>

        <div style={styles.infoRow}>
          <span style={styles.label}>Price:</span>
          <span>
            {websiteData.plan === "Beta"
              ? "Free (Unlimited Queries)"
              : websiteData.plan === "Starter"
                ? "$120/month"
                : websiteData.plan === "Enterprise"
                  ? "$0.10 per query"
                  : "Free"}
          </span>
        </div>

        <div style={styles.infoRow}>
          <span style={styles.label}>Last Synced:</span>
          <span>
            {websiteData.lastSyncedAt
              ? new Date(websiteData.lastSyncedAt).toLocaleString()
              : "Never"}
          </span>
        </div>
        <div style={styles.infoRow}>
          <span style={{ width: "100px" }}></span>
          <button
            style={styles.secondaryButton}
            onClick={() =>
              window.open(
                `https://www.voicero.ai/app/websites/website?id=${websiteData.id}`,
                "_blank",
              )
            }
          >
            Update Subscription
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      <div style={styles.toast}>
        <span>{toastMessage}</span>
        <button
          onClick={toggleToast}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            marginLeft: "12px",
            color: toastType === "critical" ? "#d82c0d" : "#008060",
          }}
        >
          ✕
        </button>
      </div>

      {/* Disconnect Modal */}
      {showDisconnectModal && (
        <div style={styles.modal} onClick={() => setShowDisconnectModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalHeader}>Disconnect Website</h3>
            <p>
              Are you sure you want to disconnect your website from VoiceroAI?
            </p>
            <p style={{ color: "#d82c0d" }}>
              This action cannot be undone. You will need to reconnect your
              website if you want to use VoiceroAI again.
            </p>
            <div style={styles.modalActions}>
              <button
                style={styles.secondaryButton}
                onClick={() => setShowDisconnectModal(false)}
              >
                Cancel
              </button>
              <button
                style={styles.destructiveButton}
                onClick={handleDisconnect}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
