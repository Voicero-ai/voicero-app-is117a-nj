import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
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
  Spinner,
  Banner,
  Badge,
  Icon,
  Tabs,
  LegacyTabs,
  Collapsible,
  Link,
  LegacyCard,
  ResourceList,
  ResourceItem,
  Thumbnail,
  SkeletonBodyText,
  SkeletonDisplayText,
  EmptyState,
} from "@shopify/polaris";
import {
  DataPresentationIcon,
  RefreshIcon,
  BlogIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const dynamic = "force-dynamic";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

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
  const accessKey = metafieldData.data.shop.metafield?.value;

  if (!accessKey) {
    return json({
      disconnected: true,
      error: "No access key found",
    });
  }

  return json({
    accessKey,
  });
};

export default function NewsSettingsPage() {
  const { accessKey, error, disconnected } = useLoaderData();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [newsData, setNewsData] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [selectedBlogIndex, setSelectedBlogIndex] = useState(0);
  const [expandedArticleId, setExpandedArticleId] = useState(null);

  const fetchNewsData = async () => {
    if (!accessKey) return;

    setIsLoading(true);
    setFetchError(null);

    try {
      const response = await fetch(
        `/api/news?accessKey=${encodeURIComponent(accessKey)}`,
      );
      const data = await response.json();

      console.log("News API response:", data);

      if (data.success === false) {
        setFetchError(data.error || "Failed to fetch news data");
      } else {
        setNewsData(data);
      }
    } catch (error) {
      console.error("Error fetching news data:", error);
      setFetchError(error.message || "Failed to fetch news data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (accessKey) {
      fetchNewsData();
    }
  }, [accessKey]);

  // Redirect if disconnected
  useEffect(() => {
    if (disconnected) {
      navigate("/app");
    }
  }, [disconnected, navigate]);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Toggle article expansion
  const toggleArticleExpansion = (articleId) => {
    setExpandedArticleId(expandedArticleId === articleId ? null : articleId);
  };

  // Get blogs from news data
  const blogs = newsData?.json?.blogs || [];

  // Get tab items for blog selection
  const tabItems = blogs.map((blog) => ({
    id: blog.id,
    content: blog.title,
    accessibilityLabel: `View ${blog.title} blog`,
    panelID: `blog-${blog.id}`,
  }));

  // Get selected blog
  const selectedBlog = blogs[selectedBlogIndex] || null;

  // Get articles from selected blog
  const articles = selectedBlog?.blogPosts || [];

  if (disconnected) {
    return null; // Don't render anything while redirecting
  }

  return (
    <Page
      title="News Interface Settings"
      backAction={{
        content: "Back",
        onAction: () => navigate("/app"),
      }}
      primaryAction={{
        content: "Refresh Data",
        icon: RefreshIcon,
        onAction: fetchNewsData,
        disabled: isLoading,
      }}
    >
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Icon
                      source={BlogIcon || DataPresentationIcon}
                      color="highlight"
                    />
                    <Text as="h3" variant="headingMd">
                      Blog Selection
                    </Text>
                  </InlineStack>
                </InlineStack>
                <Divider />
                <BlockStack gap="300">
                  {isLoading ? (
                    <Box padding="400">
                      <BlockStack gap="200" align="center">
                        <Spinner size="large" />
                        <Text alignment="center">Loading news data...</Text>
                      </BlockStack>
                    </Box>
                  ) : fetchError ? (
                    <Banner status="critical">
                      <p>Error loading news data: {fetchError}</p>
                    </Banner>
                  ) : blogs.length > 0 ? (
                    <BlockStack gap="400">
                      {/* Blog Tabs */}
                      <LegacyTabs
                        tabs={tabItems}
                        selected={selectedBlogIndex}
                        onSelect={(selectedTabIndex) =>
                          setSelectedBlogIndex(selectedTabIndex)
                        }
                      />

                      {/* Selected Blog Info */}
                      <Box
                        padding="400"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <BlockStack gap="200">
                          <InlineStack align="space-between">
                            <Text variant="headingMd" fontWeight="bold">
                              {selectedBlog.title}
                            </Text>
                            <Badge>{articles.length} articles</Badge>
                          </InlineStack>
                          <Text variant="bodySm" color="subdued">
                            Handle: {selectedBlog.handle} | Created:{" "}
                            {formatDate(selectedBlog.createdAt)}
                          </Text>
                        </BlockStack>
                      </Box>

                      {/* Articles List */}
                      <Text variant="headingSm">Articles</Text>
                      {articles.length > 0 ? (
                        <ResourceList
                          items={articles}
                          renderItem={(article) => {
                            const isExpanded = expandedArticleId === article.id;
                            return (
                              <ResourceItem
                                id={article.id}
                                accessibilityLabel={`View details for ${article.title}`}
                                onClick={() =>
                                  toggleArticleExpansion(article.id)
                                }
                              >
                                <BlockStack gap="200">
                                  <InlineStack align="space-between">
                                    <Text variant="bodyMd" fontWeight="bold">
                                      {article.title}
                                    </Text>
                                    <Button
                                      plain
                                      icon={
                                        isExpanded
                                          ? ChevronUpIcon
                                          : ChevronDownIcon
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleArticleExpansion(article.id);
                                      }}
                                    />
                                  </InlineStack>
                                  <InlineStack align="start" gap="200">
                                    <Text variant="bodySm" color="subdued">
                                      Published:{" "}
                                      {formatDate(article.publishedAt)}
                                    </Text>
                                    {article.author && (
                                      <Text variant="bodySm" color="subdued">
                                        Author: {article.author}
                                      </Text>
                                    )}
                                  </InlineStack>

                                  <Collapsible
                                    open={isExpanded}
                                    id={`article-${article.id}`}
                                  >
                                    <Box
                                      padding="300"
                                      background="bg-surface-subdued"
                                      borderRadius="200"
                                    >
                                      <BlockStack gap="300">
                                        <Text variant="headingSm">
                                          Content Preview
                                        </Text>
                                        <div
                                          style={{
                                            maxHeight: "200px",
                                            overflow: "auto",
                                            padding: "12px",
                                            backgroundColor: "white",
                                            borderRadius: "8px",
                                            border: "1px solid #e1e3e5",
                                          }}
                                        >
                                          {article.content ? (
                                            <div
                                              dangerouslySetInnerHTML={{
                                                __html:
                                                  article.content.substring(
                                                    0,
                                                    500,
                                                  ) +
                                                  (article.content.length > 500
                                                    ? "..."
                                                    : ""),
                                              }}
                                            />
                                          ) : (
                                            <Text color="subdued">
                                              No content available
                                            </Text>
                                          )}
                                        </div>
                                        <InlineStack align="end">
                                          <Button size="slim">
                                            View Full Article
                                          </Button>
                                        </InlineStack>
                                      </BlockStack>
                                    </Box>
                                  </Collapsible>
                                </BlockStack>
                              </ResourceItem>
                            );
                          }}
                        />
                      ) : (
                        <EmptyState
                          heading="No articles found"
                          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        >
                          <p>This blog doesn't have any articles yet.</p>
                        </EmptyState>
                      )}
                    </BlockStack>
                  ) : (
                    <EmptyState
                      heading="No blogs found"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>No blog data is available from the API.</p>
                    </EmptyState>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Raw API Response */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Icon source={DataPresentationIcon} color="highlight" />
                    <Text as="h3" variant="headingMd">
                      Raw API Response
                    </Text>
                  </InlineStack>
                </InlineStack>
                <Divider />
                <Box
                  background="bg-surface-secondary"
                  padding="400"
                  borderRadius="200"
                  overflowX="scroll"
                >
                  <pre style={{ margin: 0 }}>
                    {newsData
                      ? JSON.stringify(newsData, null, 2)
                      : "No data available"}
                  </pre>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
