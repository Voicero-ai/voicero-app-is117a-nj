import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Box,
  Divider,
  Badge,
  Icon,
  Toast,
  Frame,
  Spinner,
  TextField,
} from "@shopify/polaris";
import {
  QuestionCircleIcon,
  AutomationIcon,
  EditIcon,
  CheckIcon,
  ViewIcon,
  RefreshIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { PlusIcon, DeleteIcon } from "@shopify/polaris-icons";
import "react-quill-new/dist/quill.snow.css";
import { marked } from "marked";

export const dynamic = "force-dynamic";

// Client-only loader for react-quill-new to avoid SSR issues in Remix
function QuillEditor(props) {
  const [Editor, setEditor] = useState(null);
  useEffect(() => {
    let mounted = true;
    import("react-quill-new").then((mod) => {
      if (mounted) setEditor(() => mod.default);
    });
    return () => {
      mounted = false;
    };
  }, []);
  if (!Editor) return <div style={{ minHeight: 300 }} />;
  return <Editor {...props} />;
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

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
    return json({ disconnected: true, error: "No access key found" });
  }

  return json({ accessKey });
};

export default function HelpSettingsPage() {
  const { accessKey, error, disconnected } = useLoaderData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Remove old markdown toolbar: React Quill handles formatting itself

  const fetchQuestions = async () => {
    if (!accessKey) return;
    try {
      setIsLoading(true);
      const res = await fetch(`/api/helpCenter/get`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ accessKey }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to load help center");
      }
      const modules = Array.isArray(data.modules) ? data.modules : [];
      const mapped = modules.map((m) => ({
        id: m.id,
        title: m.question,
        order: Number(m.number) || 0,
        isAIGenerated: (m.type || "manual") === "ai",
        status: m.status || "draft",
        content: m.documentAnswer || "",
        websiteId: m.websiteId,
      }));
      setQuestions(mapped);
      setSelectedQuestion(mapped[0] || null);
    } catch (e) {
      setToastMessage(e.message);
      setToastActive(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedQuestion) return;
    try {
      setIsSubmitting(true);
      // If content appears to be markdown (no HTML tags), convert to HTML for storage
      const looksLikeHtml = /<[^>]+>/.test(editContent);
      const contentToSave = looksLikeHtml
        ? editContent
        : marked.parse(editContent || "");
      const res = await fetch(`/api/helpCenter/edit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          accessKey,
          id: selectedQuestion.id,
          question: editTitle,
          documentAnswer: contentToSave,
          number: selectedQuestion.order,
          type: selectedQuestion.isAIGenerated ? "ai" : "manual",
          status: selectedQuestion.status,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to save changes");
      }
      const updated = questions.map((q) =>
        q.id === selectedQuestion.id
          ? { ...q, content: contentToSave, title: editTitle }
          : q,
      );
      setQuestions(updated);
      setSelectedQuestion({
        ...selectedQuestion,
        content: contentToSave,
        title: editTitle,
      });
      setIsEditing(false);
      setToastMessage("Changes saved successfully!");
      setToastActive(true);
    } catch (e) {
      setToastMessage(e.message || "Failed to save");
      setToastActive(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updatePublishStatus = async (nextStatus) => {
    if (!selectedQuestion) return;
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/helpCenter/edit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          accessKey,
          id: selectedQuestion.id,
          question: selectedQuestion.title,
          documentAnswer: selectedQuestion.content,
          number: selectedQuestion.order,
          type: selectedQuestion.isAIGenerated ? "ai" : "manual",
          status: nextStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to update status");
      }
      const updated = questions.map((q) =>
        q.id === selectedQuestion.id ? { ...q, status: nextStatus } : q,
      );
      setQuestions(updated);
      setSelectedQuestion({ ...selectedQuestion, status: nextStatus });
      setToastMessage(
        nextStatus === "published"
          ? "Question published successfully!"
          : "Question unpublished successfully!",
      );
      setToastActive(true);
    } catch (e) {
      setToastMessage(e.message || "Failed to update status");
      setToastActive(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublish = () => updatePublishStatus("published");

  const handleUnpublish = () => updatePublishStatus("draft");

  const handleDelete = async (id) => {
    if (!id) return;
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/helpCenter/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ accessKey, id }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to delete");
      }
      const next = questions.filter((q) => q.id !== id);
      setQuestions(next);
      setSelectedQuestion(next[0] || null);
      setToastMessage("Question deleted");
      setToastActive(true);
    } catch (e) {
      setToastMessage(e.message || "Failed to delete");
      setToastActive(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdd = async () => {
    try {
      setIsSubmitting(true);
      const nextOrder =
        questions.reduce((max, q) => Math.max(max, Number(q.order) || 0), 0) +
        1;
      const draftTitle = "New Question";
      const draftContent = "<p></p>";
      const res = await fetch(`/api/helpCenter/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          accessKey,
          question: draftTitle,
          documentAnswer: draftContent,
          number: nextOrder,
          type: "manual",
          status: "draft",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to add question");
      }
      const created = data.module || data.created || data.result || null;
      const newItem = {
        id: created?.id || `${Date.now()}`,
        title: draftTitle,
        order: nextOrder,
        isAIGenerated: false,
        status: "draft",
        content: draftContent,
        websiteId: created?.websiteId || null,
      };
      const next = [...questions, newItem].sort((a, b) => a.order - b.order);
      setQuestions(next);
      setSelectedQuestion(newItem);
      setIsEditing(true);
      setEditContent(draftContent);
      setEditTitle(draftTitle);
      setToastMessage("Question added");
      setToastActive(true);
    } catch (e) {
      setToastMessage(e.message || "Failed to add question");
      setToastActive(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (disconnected) navigate("/app");
  }, [disconnected, navigate]);

  useEffect(() => {
    if (accessKey) fetchQuestions();
  }, [accessKey]);

  const toastMarkup = toastActive ? (
    <Toast
      content={toastMessage}
      onDismiss={() => setToastActive(false)}
      duration={3000}
    />
  ) : null;

  return (
    <Frame>
      <Page
        title="Help Center"
        backAction={{
          content: "Back",
          onAction: () => navigate("/app"),
        }}
        primaryAction={{
          content: "Refresh",
          icon: RefreshIcon,
          onAction: () => {
            if (!isLoading) fetchQuestions();
          },
        }}
      >
        <BlockStack gap="300">
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="200">
                  {isLoading && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        padding: 12,
                      }}
                    >
                      <Spinner
                        accessibilityLabel="Loading help modules"
                        size="large"
                      />
                    </div>
                  )}

                  <div
                    style={{
                      background:
                        "linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)",
                      borderRadius: "20px",
                      padding: "24px",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    <InlineStack gap="300" align="center">
                      <div
                        style={{
                          width: "48px",
                          height: "48px",
                          borderRadius: "14px",
                          background:
                            "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 4px 12px rgba(139, 92, 246, 0.3)",
                        }}
                      >
                        <Icon source={QuestionCircleIcon} color="base" />
                      </div>
                      <BlockStack gap="100">
                        <Text variant="headingXl" fontWeight="bold">
                          Help Center
                        </Text>
                        <Text variant="bodyMd" color="subdued">
                          Find answers to common questions and learn how to use
                          our platform effectively.
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </div>

                  <div style={{ display: "flex", gap: "32px" }}>
                    {/* Sidebar */}
                    <div style={{ width: "320px", flexShrink: 0 }}>
                      <Card>
                        <BlockStack gap="200">
                          <InlineStack gap="200" align="center">
                            <Icon
                              source={QuestionCircleIcon}
                              color="highlight"
                            />
                            <Text variant="headingMd" fontWeight="semibold">
                              Questions
                            </Text>
                          </InlineStack>

                          <InlineStack>
                            <Button
                              icon={PlusIcon}
                              onClick={handleAdd}
                              disabled={isSubmitting || isLoading}
                              loading={isSubmitting}
                            >
                              Add Question
                            </Button>
                          </InlineStack>

                          <BlockStack gap="200">
                            {questions.map((question) => (
                              <div
                                key={question.id}
                                style={{
                                  background:
                                    selectedQuestion?.id === question.id
                                      ? "linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)"
                                      : "linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%)",
                                  borderRadius: "12px",
                                  padding: "16px",
                                  border:
                                    selectedQuestion?.id === question.id
                                      ? "2px solid #3B82F6"
                                      : "1px solid #E5E7EB",
                                  cursor: "pointer",
                                  transition: "all 0.2s ease-in-out",
                                }}
                                onClick={() => setSelectedQuestion(question)}
                                onMouseEnter={(e) => {
                                  if (selectedQuestion?.id !== question.id) {
                                    e.currentTarget.style.transform =
                                      "translateY(-2px)";
                                    e.currentTarget.style.boxShadow =
                                      "0 8px 16px rgba(16, 24, 40, 0.08)";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (selectedQuestion?.id !== question.id) {
                                    e.currentTarget.style.transform =
                                      "translateY(0)";
                                    e.currentTarget.style.boxShadow = "none";
                                  }
                                }}
                              >
                                <BlockStack gap="200">
                                  <InlineStack align="space-between">
                                    <Text variant="bodyMd" fontWeight="medium">
                                      {question.title}
                                    </Text>
                                    <div
                                      style={{
                                        backgroundColor: "#F3F4F6",
                                        padding: "4px 8px",
                                        borderRadius: "12px",
                                        fontSize: "12px",
                                      }}
                                    >
                                      <Text variant="bodySm" color="subdued">
                                        #{question.order}
                                      </Text>
                                    </div>
                                  </InlineStack>

                                  <InlineStack gap="200" wrap>
                                    {question.isAIGenerated ? (
                                      <div
                                        style={{
                                          backgroundColor: "#EFF6FF",
                                          padding: "4px 8px",
                                          borderRadius: "12px",
                                          border: "1px solid #BFDBFE",
                                        }}
                                      >
                                        <InlineStack gap="100" align="center">
                                          <Icon
                                            source={AutomationIcon}
                                            color="highlight"
                                          />
                                          <Text
                                            variant="bodySm"
                                            color="highlight"
                                            fontWeight="500"
                                          >
                                            AI Generated
                                          </Text>
                                        </InlineStack>
                                      </div>
                                    ) : (
                                      <div
                                        style={{
                                          backgroundColor: "#F0FDF4",
                                          padding: "4px 8px",
                                          borderRadius: "12px",
                                          border: "1px solid #86EFAC",
                                        }}
                                      >
                                        <InlineStack gap="100" align="center">
                                          <Icon
                                            source={EditIcon}
                                            color="success"
                                          />
                                          <Text
                                            variant="bodySm"
                                            color="success"
                                            fontWeight="500"
                                          >
                                            Manual
                                          </Text>
                                        </InlineStack>
                                      </div>
                                    )}

                                    {question.status === "published" ? (
                                      <div
                                        style={{
                                          backgroundColor: "#F0FDF4",
                                          padding: "4px 8px",
                                          borderRadius: "12px",
                                          border: "1px solid #86EFAC",
                                        }}
                                      >
                                        <InlineStack gap="100" align="center">
                                          <Icon
                                            source={CheckIcon}
                                            color="success"
                                          />
                                          <Text
                                            variant="bodySm"
                                            color="success"
                                            fontWeight="500"
                                          >
                                            Published
                                          </Text>
                                        </InlineStack>
                                      </div>
                                    ) : (
                                      <div
                                        style={{
                                          backgroundColor: "#FEF3C7",
                                          padding: "4px 8px",
                                          borderRadius: "12px",
                                          border: "1px solid #FDE68A",
                                        }}
                                      >
                                        <InlineStack gap="100" align="center">
                                          <Icon
                                            source={ViewIcon}
                                            color="caution"
                                          />
                                          <Text
                                            variant="bodySm"
                                            color="caution"
                                            fontWeight="500"
                                          >
                                            Draft
                                          </Text>
                                        </InlineStack>
                                      </div>
                                    )}
                                  </InlineStack>
                                  <InlineStack align="end">
                                    <Button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(question.id);
                                      }}
                                      icon={DeleteIcon}
                                      variant="secondary"
                                      tone="critical"
                                      disabled={isSubmitting}
                                      loading={isSubmitting}
                                    >
                                      Delete
                                    </Button>
                                  </InlineStack>
                                </BlockStack>
                              </div>
                            ))}
                          </BlockStack>
                        </BlockStack>
                      </Card>
                    </div>

                    {/* Main Content */}
                    <div style={{ flex: 1 }}>
                      {!selectedQuestion ? (
                        <Card>
                          <BlockStack gap="300" align="center">
                            <Text>No questions yet.</Text>
                            <Button
                              icon={PlusIcon}
                              onClick={handleAdd}
                              disabled={isSubmitting || isLoading}
                              loading={isSubmitting}
                            >
                              Add your first question
                            </Button>
                          </BlockStack>
                        </Card>
                      ) : (
                        <BlockStack gap="300">
                          {/* Question Header */}
                          <Card>
                            <BlockStack gap="200">
                              <div
                                style={{
                                  background:
                                    "linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)",
                                  borderRadius: "16px",
                                  padding: "24px",
                                  border: "1px solid #E2E8F0",
                                }}
                              >
                                <BlockStack gap="300">
                                  {isEditing ? (
                                    <TextField
                                      value={editTitle}
                                      onChange={setEditTitle}
                                      autoComplete="off"
                                      placeholder="Enter question title"
                                    />
                                  ) : (
                                    <Text variant="headingLg" fontWeight="bold">
                                      {selectedQuestion.title}
                                    </Text>
                                  )}

                                  <InlineStack gap="200" wrap>
                                    <div
                                      style={{
                                        backgroundColor: "#F3F4F6",
                                        padding: "6px 12px",
                                        borderRadius: "20px",
                                        border: "1px solid #D1D5DB",
                                      }}
                                    >
                                      <Text variant="bodySm" color="subdued">
                                        #{selectedQuestion.order}
                                      </Text>
                                    </div>

                                    {selectedQuestion.isAIGenerated ? (
                                      <div
                                        style={{
                                          backgroundColor: "#EFF6FF",
                                          padding: "6px 12px",
                                          borderRadius: "20px",
                                          border: "1px solid #BFDBFE",
                                        }}
                                      >
                                        <InlineStack gap="100" align="center">
                                          <Icon
                                            source={AutomationIcon}
                                            color="highlight"
                                          />
                                          <Text
                                            variant="bodySm"
                                            color="highlight"
                                            fontWeight="500"
                                          >
                                            AI Generated
                                          </Text>
                                        </InlineStack>
                                      </div>
                                    ) : (
                                      <div
                                        style={{
                                          backgroundColor: "#F0FDF4",
                                          padding: "6px 12px",
                                          borderRadius: "20px",
                                          border: "1px solid #86EFAC",
                                        }}
                                      >
                                        <InlineStack gap="100" align="center">
                                          <Icon
                                            source={EditIcon}
                                            color="success"
                                          />
                                          <Text
                                            variant="bodySm"
                                            color="success"
                                            fontWeight="500"
                                          >
                                            Manual
                                          </Text>
                                        </InlineStack>
                                      </div>
                                    )}

                                    {selectedQuestion.status === "published" ? (
                                      <div
                                        style={{
                                          backgroundColor: "#F0FDF4",
                                          padding: "6px 12px",
                                          borderRadius: "20px",
                                          border: "1px solid #86EFAC",
                                        }}
                                      >
                                        <InlineStack gap="100" align="center">
                                          <Icon
                                            source={CheckIcon}
                                            color="success"
                                          />
                                          <Text
                                            variant="bodySm"
                                            color="success"
                                            fontWeight="500"
                                          >
                                            Published
                                          </Text>
                                        </InlineStack>
                                      </div>
                                    ) : (
                                      <div
                                        style={{
                                          backgroundColor: "#FEF3C7",
                                          padding: "6px 12px",
                                          borderRadius: "20px",
                                          border: "1px solid #FDE68A",
                                        }}
                                      >
                                        <InlineStack gap="100" align="center">
                                          <Icon
                                            source={ViewIcon}
                                            color="caution"
                                          />
                                          <Text
                                            variant="bodySm"
                                            color="caution"
                                            fontWeight="500"
                                          >
                                            Draft
                                          </Text>
                                        </InlineStack>
                                      </div>
                                    )}
                                  </InlineStack>
                                </BlockStack>
                              </div>

                              <Divider />

                              <InlineStack gap="300">
                                {isEditing ? (
                                  <>
                                    <Button
                                      onClick={() => {
                                        setIsEditing(false);
                                        setEditContent("");
                                      }}
                                      variant="secondary"
                                      disabled={isSubmitting}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      onClick={handleSave}
                                      primary
                                      icon={CheckIcon}
                                      disabled={isSubmitting}
                                      loading={isSubmitting}
                                    >
                                      Save Changes
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      onClick={() => {
                                        setIsEditing(true);
                                        setEditContent(
                                          selectedQuestion.content,
                                        );
                                        setEditTitle(selectedQuestion.title);
                                      }}
                                      primary
                                      icon={EditIcon}
                                      disabled={isSubmitting}
                                      loading={isSubmitting}
                                    >
                                      Edit
                                    </Button>
                                    {selectedQuestion.status === "published" ? (
                                      <Button
                                        onClick={handleUnpublish}
                                        variant="secondary"
                                        icon={ViewIcon}
                                        disabled={isSubmitting}
                                        loading={isSubmitting}
                                      >
                                        Unpublish
                                      </Button>
                                    ) : (
                                      <Button
                                        onClick={handlePublish}
                                        icon={CheckIcon}
                                        style={{
                                          backgroundColor: "#10B981",
                                          borderColor: "#10B981",
                                        }}
                                        disabled={isSubmitting}
                                        loading={isSubmitting}
                                      >
                                        Publish
                                      </Button>
                                    )}
                                  </>
                                )}
                              </InlineStack>
                            </BlockStack>
                          </Card>

                          {/* Article Content */}
                          <Card>
                            <BlockStack gap="200">
                              {isEditing ? (
                                <div>
                                  <Text
                                    variant="headingSm"
                                    fontWeight="semibold"
                                  >
                                    Rich Text Editor
                                  </Text>

                                  {/* Remove custom toolbar; use Quill toolbar */}

                                  <div style={{ border: "1px solid #E5E7EB" }}>
                                    <div style={{ minHeight: 220 }}>
                                      <QuillEditor
                                        theme="snow"
                                        value={editContent}
                                        onChange={setEditContent}
                                        placeholder="Write your content here..."
                                        modules={{
                                          toolbar: [
                                            [{ header: [1, 2, 3, false] }],
                                            [
                                              "bold",
                                              "italic",
                                              "underline",
                                              "strike",
                                            ],
                                            [{ list: "ordered" }],
                                            ["blockquote", "code"],
                                            ["link", "clean"],
                                          ],
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    background:
                                      "linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)",
                                    borderRadius: "16px",
                                    padding: "24px",
                                    border: "1px solid #E2E8F0",
                                    minHeight: "400px",
                                  }}
                                >
                                  <div
                                    style={{
                                      lineHeight: "1.6",
                                      color: "#374151",
                                    }}
                                    dangerouslySetInnerHTML={{
                                      __html: selectedQuestion.content,
                                    }}
                                  />
                                </div>
                              )}
                            </BlockStack>
                          </Card>
                        </BlockStack>
                      )}
                    </div>
                  </div>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>
        {toastMarkup}
      </Page>
    </Frame>
  );
}
