import { useState } from "react";
import { useNavigate, useSearchParams } from "@remix-run/react";
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
  TextField,
  Select,
  Tabs,
  Collapsible,
  ResourceList,
  ResourceItem,
  EmptyState,
  Toast,
  Frame,
} from "@shopify/polaris";
import {
  QuestionCircleIcon,
  AutomationIcon,
  EditIcon,
  CheckIcon,
  ViewIcon,
  TextIcon,
  TextIcon as ListIcon,
  TextIcon as NumberedListIcon,
  LinkIcon,
  TextIcon as TableIcon,
  TextIcon as HeadingIcon,
  TextIcon as QuoteIcon,
  TextIcon as CodeIcon,
  RefreshIcon,
  SettingsIcon,
} from "@shopify/polaris-icons";

export const dynamic = "force-dynamic";

// Mock data for help questions
const fakeQuestions = [
  {
    id: "1",
    title: "How do I connect my Shopify store?",
    order: 1,
    isAIGenerated: true,
    status: "published",
    content: `# Connecting Your Shopify Store

To connect your Shopify store to our platform, follow these steps:

## Prerequisites
- Admin access to your Shopify store
- Store URL (e.g., yourstore.myshopify.com)

## Step-by-Step Process

### 1. Generate API Credentials
1. Log into your Shopify admin panel
2. Go to **Apps** → **Develop apps**
3. Click **Create an app**
4. Give your app a name (e.g., "Voicero AI Integration")
5. Select **Admin API integration**
6. Configure the required scopes:
   - **Read products** - To access product information
   - **Read customers** - To access customer data
   - **Read orders** - To access order information
   - **Read inventory** - To access stock levels

### 2. Install the App
1. Click **Install app** in your app settings
2. Copy the **API key** and **API secret key**
3. Note your **store URL**

### 3. Connect to Our Platform
1. In our dashboard, go to **Connect Website**
2. Select **Shopify** as your platform
3. Enter your store URL
4. Paste your API credentials
5. Click **Connect**

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Invalid API key" | Verify you copied the full API key |
| "Access denied" | Check that you have admin permissions |
| "Store not found" | Ensure your store URL is correct |

## Security Notes
- Never share your API credentials
- Use HTTPS for all connections
- Regularly rotate your API keys

For additional support, contact our team at support@voicero.ai`,
  },
  {
    id: "2",
    title: "How does the AI training work?",
    order: 2,
    isAIGenerated: false,
    status: "published",
    content: `# AI Training Process

Our AI training system works by analyzing your website content and learning from your business context.

## Training Phases

### Phase 1: Content Analysis
- **Web scraping** of your website pages
- **Document processing** (PDFs, Word docs, etc.)
- **Content categorization** by topic and relevance
- **Metadata extraction** for better context

### Phase 2: Knowledge Base Creation
- **Vectorization** of content into searchable formats
- **Semantic indexing** for natural language queries
- **Context linking** between related topics
- **Quality scoring** of content relevance

### Phase 3: AI Model Training
- **Fine-tuning** on your specific content
- **Domain adaptation** to your industry
- **Response generation** training
- **Accuracy validation** testing

## Training Data Sources

| Source | Description | Update Frequency |
|--------|-------------|------------------|
| Website Pages | Static content and blog posts | Daily |
| Product Catalog | Product descriptions and specs | Real-time |
| Customer FAQs | Common questions and answers | Weekly |
| Support Tickets | Issue resolution patterns | Monthly |

## Performance Metrics

- **Training Time**: 2-4 hours for initial setup
- **Accuracy**: 95%+ on domain-specific questions
- **Response Time**: <2 seconds for most queries
- **Coverage**: 99% of your business topics

## Best Practices

1. **Regular Updates**: Keep content fresh and current
2. **Quality Content**: Ensure accurate and helpful information
3. **Customer Feedback**: Use real questions to improve training
4. **Monitoring**: Track AI performance and accuracy

## Customization Options

- **Brand Voice**: Match your company's tone and style
- **Industry Terms**: Learn your specific jargon and terminology
- **Response Length**: Adjust from brief to detailed answers
- **Source Attribution**: Include links to original content`,
  },
  {
    id: "3",
    title: "What are the pricing plans?",
    order: 3,
    isAIGenerated: true,
    status: "draft",
    content: `# Pricing Plans Overview

We offer flexible pricing plans to meet businesses of all sizes.

## Plan Comparison

| Feature | Starter | Professional | Enterprise |
|---------|---------|--------------|------------|
| **Monthly Price** | $29 | $99 | $299 |
| **Annual Price** | $290 | $990 | $2,990 |
| **AI Conversations** | 1,000/month | 10,000/month | Unlimited |
| **Website Connections** | 1 | 5 | Unlimited |
| **Training Documents** | 100 MB | 1 GB | 10 GB |
| **Customer Support** | Email | Email + Chat | Priority + Phone |
| **Custom Branding** | ❌ | ✅ | ✅ |
| **API Access** | ❌ | ✅ | ✅ |
| **Advanced Analytics** | ❌ | ✅ | ✅ |
| **White-label Solution** | ❌ | ❌ | ✅ |

## What's Included

### Starter Plan ($29/month)
- Basic AI chatbot
- Standard response templates
- Email support
- Basic analytics dashboard

### Professional Plan ($99/month)
- Advanced AI capabilities
- Custom response training
- Priority support
- Advanced analytics
- Multiple website support

### Enterprise Plan ($299/month)
- Full AI customization
- Dedicated account manager
- Phone support
- Custom integrations
- White-label options

## Additional Services

| Service | Price | Description |
|---------|-------|-------------|
| **Custom Training** | $500 | Specialized AI training for your industry |
| **API Development** | $1,000 | Custom API endpoints and integrations |
| **White-label Setup** | $2,000 | Branded solution for reselling |
| **Priority Support** | $200/month | 24/7 phone and chat support |

## Payment Options

- **Credit Card**: Visa, Mastercard, American Express
- **Bank Transfer**: Available for annual plans
- **Invoice**: Available for Enterprise customers
- **PayPal**: Available for Starter and Professional plans

## Refund Policy

- **30-day money-back guarantee** for all plans
- **Pro-rated refunds** for annual plans
- **No questions asked** cancellation policy

## Volume Discounts

- **10% off** for 2+ Professional plans
- **20% off** for 5+ Professional plans
- **Custom pricing** for Enterprise customers

*All prices are in USD and subject to change with 30 days notice.*`,
  },
];

export default function HelpSettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [selectedQuestion, setSelectedQuestion] = useState(fakeQuestions[0]);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Rich text formatting functions
  const formatText = (format) => {
    const textarea = document.getElementById("edit-textarea");
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = editContent.substring(start, end);

    let formattedText = "";
    let newCursorPos = start;

    switch (format) {
      case "bold":
        formattedText = `**${selectedText}**`;
        newCursorPos = start + 2;
        break;
      case "italic":
        formattedText = `*${selectedText}*`;
        newCursorPos = start + 1;
        break;
      case "heading":
        formattedText = `# ${selectedText}`;
        newCursorPos = start + 2;
        break;
      case "list-ul":
        formattedText = `- ${selectedText}`;
        newCursorPos = start + 2;
        break;
      case "list-ol":
        formattedText = `1. ${selectedText}`;
        newCursorPos = start + 3;
        break;
      case "quote":
        formattedText = `> ${selectedText}`;
        newCursorPos = start + 2;
        break;
      case "code":
        formattedText = `\`${selectedText}\``;
        newCursorPos = start + 1;
        break;
      case "link":
        formattedText = `[${selectedText}](url)`;
        newCursorPos = start + 1;
        break;
      case "table":
        formattedText = `| Header 1 | Header 2 | Header 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |`;
        newCursorPos = start + formattedText.length;
        break;
    }

    const newContent =
      editContent.substring(0, start) +
      formattedText +
      editContent.substring(end);
    setEditContent(newContent);

    // Set cursor position after formatting
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleSave = () => {
    // Save functionality would go here
    setIsEditing(false);
    setToastMessage("Changes saved successfully!");
    setToastActive(true);
  };

  const handlePublish = () => {
    setToastMessage("Question published successfully!");
    setToastActive(true);
  };

  const handleUnpublish = () => {
    setToastMessage("Question unpublished successfully!");
    setToastActive(true);
  };

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
            setToastMessage("Help content refreshed!");
            setToastActive(true);
          },
        }}
      >
        <BlockStack gap="500">
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
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
                        <BlockStack gap="400">
                          <InlineStack gap="200" align="center">
                            <Icon
                              source={QuestionCircleIcon}
                              color="highlight"
                            />
                            <Text variant="headingMd" fontWeight="semibold">
                              Questions
                            </Text>
                          </InlineStack>

                          <BlockStack gap="300">
                            {fakeQuestions.map((question) => (
                              <div
                                key={question.id}
                                style={{
                                  background:
                                    selectedQuestion.id === question.id
                                      ? "linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)"
                                      : "linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%)",
                                  borderRadius: "12px",
                                  padding: "16px",
                                  border:
                                    selectedQuestion.id === question.id
                                      ? "2px solid #3B82F6"
                                      : "1px solid #E5E7EB",
                                  cursor: "pointer",
                                  transition: "all 0.2s ease-in-out",
                                }}
                                onClick={() => setSelectedQuestion(question)}
                                onMouseEnter={(e) => {
                                  if (selectedQuestion.id !== question.id) {
                                    e.currentTarget.style.transform =
                                      "translateY(-2px)";
                                    e.currentTarget.style.boxShadow =
                                      "0 8px 16px rgba(16, 24, 40, 0.08)";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (selectedQuestion.id !== question.id) {
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
                                </BlockStack>
                              </div>
                            ))}
                          </BlockStack>
                        </BlockStack>
                      </Card>
                    </div>

                    {/* Main Content */}
                    <div style={{ flex: 1 }}>
                      {selectedQuestion && (
                        <BlockStack gap="600">
                          {/* Question Header */}
                          <Card>
                            <BlockStack gap="400">
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
                                  <Text variant="headingLg" fontWeight="bold">
                                    {selectedQuestion.title}
                                  </Text>

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
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      onClick={handleSave}
                                      primary
                                      icon={CheckIcon}
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
                                      }}
                                      primary
                                      icon={EditIcon}
                                    >
                                      Edit
                                    </Button>
                                    {selectedQuestion.status === "published" ? (
                                      <Button
                                        onClick={handleUnpublish}
                                        variant="secondary"
                                        icon={ViewIcon}
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
                            <BlockStack gap="400">
                              {isEditing ? (
                                <div>
                                  <Text
                                    variant="headingSm"
                                    fontWeight="semibold"
                                  >
                                    Rich Text Editor
                                  </Text>

                                  {/* Formatting Toolbar */}
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      padding: "12px",
                                      backgroundColor: "#F9FAFB",
                                      border: "1px solid #E5E7EB",
                                      borderTopLeftRadius: "8px",
                                      borderTopRightRadius: "8px",
                                      borderBottom: "none",
                                    }}
                                  >
                                    <Button
                                      onClick={() => formatText("bold")}
                                      variant="tertiary"
                                      icon={TextIcon}
                                      size="slim"
                                      title="Bold (Ctrl+B)"
                                    />
                                    <Button
                                      onClick={() => formatText("italic")}
                                      variant="tertiary"
                                      icon={TextIcon}
                                      size="slim"
                                      title="Italic (Ctrl+I)"
                                    />
                                    <div
                                      style={{
                                        width: "1px",
                                        height: "24px",
                                        backgroundColor: "#E5E7EB",
                                      }}
                                    />
                                    <Button
                                      onClick={() => formatText("heading")}
                                      variant="tertiary"
                                      icon={HeadingIcon}
                                      size="slim"
                                      title="Heading"
                                    />
                                    <Button
                                      onClick={() => formatText("list-ul")}
                                      variant="tertiary"
                                      icon={ListIcon}
                                      size="slim"
                                      title="Bullet List"
                                    />
                                    <Button
                                      onClick={() => formatText("list-ol")}
                                      variant="tertiary"
                                      icon={NumberedListIcon}
                                      size="slim"
                                      title="Numbered List"
                                    />
                                    <div
                                      style={{
                                        width: "1px",
                                        height: "24px",
                                        backgroundColor: "#E5E7EB",
                                      }}
                                    />
                                    <Button
                                      onClick={() => formatText("quote")}
                                      variant="tertiary"
                                      icon={QuoteIcon}
                                      size="slim"
                                      title="Quote"
                                    />
                                    <Button
                                      onClick={() => formatText("code")}
                                      variant="tertiary"
                                      icon={CodeIcon}
                                      size="slim"
                                      title="Inline Code"
                                    />
                                    <Button
                                      onClick={() => formatText("link")}
                                      variant="tertiary"
                                      icon={LinkIcon}
                                      size="slim"
                                      title="Link"
                                    />
                                    <Button
                                      onClick={() => formatText("table")}
                                      variant="tertiary"
                                      icon={TableIcon}
                                      size="slim"
                                      title="Insert Table"
                                    />
                                  </div>

                                  <TextField
                                    id="edit-textarea"
                                    value={editContent}
                                    onChange={setEditContent}
                                    multiline={20}
                                    placeholder="Type your content here and use the formatting buttons above to add styling..."
                                    style={{
                                      fontFamily: "monospace",
                                      fontSize: "14px",
                                      borderTopLeftRadius: "0",
                                      borderTopRightRadius: "0",
                                    }}
                                  />
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
                                      __html: selectedQuestion.content
                                        .replace(
                                          /^# (.*$)/gim,
                                          '<h1 style="color: #1F2937; font-size: 24px; font-weight: bold; margin-bottom: 16px;">$1</h1>',
                                        )
                                        .replace(
                                          /^## (.*$)/gim,
                                          '<h2 style="color: #374151; font-size: 20px; font-weight: bold; margin-bottom: 12px; margin-top: 24px;">$1</h2>',
                                        )
                                        .replace(
                                          /^### (.*$)/gim,
                                          '<h3 style="color: #4B5563; font-size: 18px; font-weight: bold; margin-bottom: 8px; margin-top: 20px;">$1</h3>',
                                        )
                                        .replace(
                                          /\*\*(.*?)\*\*/g,
                                          '<strong style="font-weight: bold;">$1</strong>',
                                        )
                                        .replace(
                                          /\*(.*?)\*/g,
                                          '<em style="font-style: italic;">$1</em>',
                                        )
                                        .replace(
                                          /^- (.*$)/gim,
                                          '<li style="margin-bottom: 4px;">$1</li>',
                                        )
                                        .replace(
                                          /^(\d+)\. (.*$)/gim,
                                          '<li style="margin-bottom: 4px;">$2</li>',
                                        )
                                        .replace(
                                          /^> (.*$)/gim,
                                          '<blockquote style="border-left: 4px solid #3B82F6; padding-left: 16px; margin: 16px 0; color: #6B7280; font-style: italic;">$1</blockquote>',
                                        )
                                        .replace(
                                          /`(.*?)`/g,
                                          '<code style="background-color: #F3F4F6; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #1F2937;">$1</code>',
                                        )
                                        .replace(
                                          /\[(.*?)\]\((.*?)\)/g,
                                          '<a href="$2" style="color: #3B82F6; text-decoration: underline;">$1</a>',
                                        )
                                        .replace(/\n\n/g, "<br><br>"),
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
