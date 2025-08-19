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
  LegacyTabs,
  Collapsible,
  ResourceList,
  ResourceItem,
  EmptyState,
  Tag,
  Toast,
  Frame,
} from "@shopify/polaris";
import {
  DataPresentationIcon,
  RefreshIcon,
  BlogIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CollectionIcon,
  StarFilledIcon,
  StarIcon,
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
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);
  const [isUpdatingHot, setIsUpdatingHot] = useState(false);

  const fetchNewsData = async () => {
    if (!accessKey) return;

    setIsLoading(true);
    setFetchError(null);

    try {
      // Use POST request instead of GET
      const response = await fetch(`/api/news`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          accessKey,
          // No need to specify websiteId, the API will determine it from the access key
        }),
      });

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

  const toggleHotStatus = async (postId, currentHotStatus, websiteId) => {
    if (!accessKey || isUpdatingHot) return;

    setIsUpdatingHot(true);

    try {
      const response = await fetch(`/api/news/hot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          accessKey,
          postId,
          websiteId,
          hot: !currentHotStatus,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update the local state to reflect the change
        const updatedNewsData = { ...newsData };

        // Update the post in all blogs
        updatedNewsData.blogs = updatedNewsData.blogs.map((blog) => {
          blog.blogPosts = blog.blogPosts.map((post) => {
            if (post.id === postId) {
              return { ...post, hot: !currentHotStatus ? 1 : 0 };
            }
            return post;
          });
          return blog;
        });

        setNewsData(updatedNewsData);

        // Show success toast
        setToastMessage(
          !currentHotStatus ? "Post marked as hot!" : "Post removed from hot",
        );
        setToastError(false);
        setToastActive(true);
      } else {
        // Show error toast
        setToastMessage(data.error || "Failed to update hot status");
        setToastError(true);
        setToastActive(true);
      }
    } catch (error) {
      console.error("Error updating hot status:", error);
      setToastMessage("Error updating hot status");
      setToastError(true);
      setToastActive(true);
    } finally {
      setIsUpdatingHot(false);
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
  const blogs = newsData?.blogs || [];

  // Get all blog posts from all blogs
  const allBlogPosts = blogs.reduce((posts, blog) => {
    // Add blog title and websiteId to each post for reference
    const postsWithBlogInfo = (blog.blogPosts || []).map((post) => ({
      ...post,
      blogTitle: blog.title,
      websiteId: newsData.websiteId,
    }));
    return [...posts, ...postsWithBlogInfo];
  }, []);

  // Sort all posts with hot posts first, then by date
  const sortedAllPosts = [...allBlogPosts].sort((a, b) => {
    // First sort by hot status (hot posts first)
    if ((a.hot === 1 || a.hot === true) && b.hot !== 1 && b.hot !== true) {
      return -1;
    }
    if ((b.hot === 1 || b.hot === true) && a.hot !== 1 && a.hot !== true) {
      return 1;
    }
    // Then sort by date
    return (
      new Date(b.publishedAt || b.createdAt) -
      new Date(a.publishedAt || a.createdAt)
    );
  });

  // Get tab items for blog selection with "All" as the first tab
  const tabItems = [
    {
      id: "all",
      content: "All Blog Posts",
      accessibilityLabel: "View all blog posts",
      panelID: "all-blogs",
    },
    ...blogs.map((blog) => ({
      id: blog.id,
      content: blog.title,
      accessibilityLabel: `View ${blog.title} blog`,
      panelID: `blog-${blog.id}`,
    })),
  ];

  // Get selected blog
  const selectedBlog =
    selectedBlogIndex === 0 ? null : blogs[selectedBlogIndex - 1];

  // Get articles from selected blog or all blogs, sorted with hot posts first
  const getArticles = () => {
    if (selectedBlogIndex === 0) {
      return sortedAllPosts;
    } else if (selectedBlog?.blogPosts) {
      return [...selectedBlog.blogPosts].sort((a, b) => {
        // First sort by hot status (hot posts first)
        if ((a.hot === 1 || a.hot === true) && b.hot !== 1 && b.hot !== true) {
          return -1;
        }
        if ((b.hot === 1 || b.hot === true) && a.hot !== 1 && a.hot !== true) {
          return 1;
        }
        // Then sort by date
        return (
          new Date(b.publishedAt || b.createdAt) -
          new Date(a.publishedAt || a.createdAt)
        );
      });
    } else {
      return [];
    }
  };

  const articles = getArticles();

  // Count hot articles
  const countHotArticles = () => {
    return allBlogPosts.filter((post) => post.hot === 1 || post.hot === true)
      .length;
  };

  const hotArticlesCount = countHotArticles();

  // Render an article item
  const renderArticleItem = (article) => {
    const isExpanded = expandedArticleId === article.id;
    const isHot = article.hot === 1 || article.hot === true;
    const websiteId = article.websiteId || newsData?.websiteId;

    return (
      <ResourceItem
        id={article.id}
        accessibilityLabel={`View details for ${article.title}`}
        onClick={() => toggleArticleExpansion(article.id)}
      >
        <div
          style={{
            background: isHot
              ? "linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)"
              : "linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%)",
            borderRadius: "16px",
            padding: "20px",
            border: isHot ? "2px solid #FB923C" : "1px solid #E5E7EB",
            transition: "all 0.2s ease-in-out",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = isHot
              ? "0 12px 24px rgba(251, 146, 60, 0.15)"
              : "0 8px 16px rgba(16, 24, 40, 0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <InlineStack gap="300">
                {isHot && (
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background:
                        "linear-gradient(135deg, #FB923C 0%, #EA580C 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 4px 12px rgba(251, 146, 60, 0.3)",
                    }}
                  >
                    <Icon source={StarFilledIcon} color="base" />
                  </div>
                )}
                <Text
                  variant="bodyMd"
                  fontWeight="bold"
                  style={{
                    color: isHot ? "#EA580C" : "#1F2937",
                    fontSize: "16px",
                  }}
                >
                  {article.title}
                </Text>
              </InlineStack>
              <InlineStack gap="200">
                <Button
                  size="slim"
                  icon={isHot ? StarFilledIcon : StarIcon}
                  disabled={isUpdatingHot || (!isHot && hotArticlesCount >= 2)}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleHotStatus(article.id, isHot, websiteId);
                  }}
                  style={{
                    backgroundColor: isHot ? "#FEF3C7" : "#F3F4F6",
                    border: isHot ? "1px solid #F59E0B" : "1px solid #D1D5DB",
                    color: isHot ? "#92400E" : "#374151",
                  }}
                >
                  {isHot ? "Remove Hot" : "Make Hot"}
                </Button>
                <Button
                  plain
                  icon={isExpanded ? ChevronUpIcon : ChevronDownIcon}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleArticleExpansion(article.id);
                  }}
                  style={{
                    backgroundColor: "#F3F4F6",
                    borderRadius: "8px",
                    padding: "8px",
                  }}
                />
              </InlineStack>
            </InlineStack>

            <InlineStack align="start" gap="300" wrap>
              <div
                style={{
                  backgroundColor: "#EEF6FF",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  border: "1px solid #B3D7FF",
                }}
              >
                <Text variant="bodySm" color="highlight" fontWeight="500">
                  {formatDate(article.publishedAt)}
                </Text>
              </div>
              {article.author && (
                <div
                  style={{
                    backgroundColor: "#F0FDF4",
                    padding: "6px 12px",
                    borderRadius: "20px",
                    border: "1px solid #86EFAC",
                  }}
                >
                  <Text variant="bodySm" color="success" fontWeight="500">
                    {article.author}
                  </Text>
                </div>
              )}
              {/* Show blog tag in "All" view */}
              {selectedBlogIndex === 0 && article.blogTitle && (
                <div
                  style={{
                    backgroundColor: "#FEF3C7",
                    padding: "6px 12px",
                    borderRadius: "20px",
                    border: "1px solid #FDE68A",
                  }}
                >
                  <Text variant="bodySm" color="caution" fontWeight="500">
                    {article.blogTitle}
                  </Text>
                </div>
              )}
              {isHot && (
                <div
                  style={{
                    backgroundColor: "#FFF7ED",
                    padding: "6px 12px",
                    borderRadius: "20px",
                    border: "2px solid #FB923C",
                    boxShadow: "0 2px 8px rgba(251, 146, 60, 0.2)",
                  }}
                >
                  <Text variant="bodySm" color="caution" fontWeight="600">
                    🔥 Hot Post
                  </Text>
                </div>
              )}
            </InlineStack>

            <Collapsible open={isExpanded} id={`article-${article.id}`}>
              <Box
                padding="400"
                background="bg-surface-subdued"
                borderRadius="200"
                style={{
                  backgroundColor: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  marginTop: "16px",
                }}
              >
                <BlockStack gap="300">
                  <Text
                    variant="headingSm"
                    style={{
                      color: "#1E40AF",
                      fontWeight: "600",
                    }}
                  >
                    Article Content
                  </Text>
                  <div
                    style={{
                      maxHeight: "500px",
                      overflow: "auto",
                      padding: "20px",
                      backgroundColor: "white",
                      borderRadius: "12px",
                      border: "1px solid #E2E8F0",
                      boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.05)",
                    }}
                  >
                    {article.content ? (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: article.content,
                        }}
                        style={{
                          lineHeight: "1.6",
                          color: "#374151",
                        }}
                      />
                    ) : (
                      <Text color="subdued">No content available</Text>
                    )}
                  </div>
                </BlockStack>
              </Box>
            </Collapsible>
          </BlockStack>
        </div>
      </ResourceItem>
    );
  };

  if (disconnected) {
    return null; // Don't render anything while redirecting
  }

  const toastMarkup = toastActive ? (
    <Toast
      content={toastMessage}
      error={toastError}
      onDismiss={() => setToastActive(false)}
      duration={3000}
    />
  ) : null;

  return (
    <Frame>
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
                  <div
                    style={{
                      background:
                        "linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)",
                      borderRadius: "20px",
                      padding: "24px",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    <InlineStack align="space-between">
                      <InlineStack gap="300">
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "14px",
                            background:
                              "linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
                          }}
                        >
                          <Icon source={BlogIcon} color="base" />
                        </div>
                        <BlockStack gap="100">
                          <Text as="h3" variant="headingMd" fontWeight="bold">
                            Blog Selection
                          </Text>
                          <Text variant="bodySm" color="subdued">
                            Choose which blog to view or browse all posts
                          </Text>
                        </BlockStack>
                      </InlineStack>
                      <div
                        style={{
                          backgroundColor:
                            hotArticlesCount >= 2 ? "#FEF3C7" : "#E0F2FE",
                          padding: "8px 16px",
                          borderRadius: "20px",
                          border:
                            hotArticlesCount >= 2
                              ? "1px solid #F59E0B"
                              : "1px solid #0284C7",
                          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                        }}
                      >
                        <InlineStack gap="200" align="center">
                          <div
                            style={{
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              backgroundColor:
                                hotArticlesCount >= 2 ? "#F59E0B" : "#0284C7",
                            }}
                          />
                          <Text
                            variant="bodySm"
                            fontWeight="600"
                            style={{
                              color:
                                hotArticlesCount >= 2 ? "#92400E" : "#0C4A6E",
                            }}
                          >
                            {hotArticlesCount}/2 Hot Posts
                          </Text>
                        </InlineStack>
                      </div>
                    </InlineStack>
                  </div>

                  <BlockStack gap="300">
                    {isLoading ? (
                      <div
                        style={{
                          background:
                            "linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)",
                          borderRadius: "16px",
                          padding: "60px",
                          textAlign: "center",
                          border: "1px solid #E2E8F0",
                        }}
                      >
                        <BlockStack gap="400" align="center">
                          <div
                            style={{
                              width: "48px",
                              height: "48px",
                              borderRadius: "50%",
                              background:
                                "linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              animation: "pulse 2s infinite",
                            }}
                          >
                            <Spinner size="large" />
                          </div>
                          <Text
                            variant="headingMd"
                            alignment="center"
                            fontWeight="600"
                          >
                            Loading news data...
                          </Text>
                          <Text
                            variant="bodyMd"
                            color="subdued"
                            alignment="center"
                          >
                            Fetching the latest blog posts and articles
                          </Text>
                        </BlockStack>
                      </div>
                    ) : fetchError ? (
                      <div
                        style={{
                          background:
                            "linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)",
                          borderRadius: "16px",
                          padding: "24px",
                          border: "1px solid #FECACA",
                        }}
                      >
                        <Banner status="critical">
                          <p>Error loading news data: {fetchError}</p>
                        </Banner>
                      </div>
                    ) : blogs.length > 0 ? (
                      <BlockStack gap="400">
                        {/* Blog Tabs with All option */}
                        <div
                          style={{
                            background:
                              "linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)",
                            borderRadius: "16px",
                            padding: "20px",
                            border: "1px solid #E2E8F0",
                          }}
                        >
                          <LegacyTabs
                            tabs={tabItems}
                            selected={selectedBlogIndex}
                            onSelect={(selectedTabIndex) =>
                              setSelectedBlogIndex(selectedTabIndex)
                            }
                          />
                        </div>

                        {/* Selected Blog Info - only show for specific blogs */}
                        {selectedBlogIndex !== 0 && selectedBlog && (
                          <div
                            style={{
                              background:
                                "linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 100%)",
                              borderRadius: "16px",
                              padding: "24px",
                              border: "1px solid #7DD3FC",
                              boxShadow: "0 4px 12px rgba(2, 132, 199, 0.1)",
                            }}
                          >
                            <BlockStack gap="200">
                              <InlineStack align="space-between">
                                <Text
                                  variant="headingMd"
                                  fontWeight="bold"
                                  style={{ color: "#0C4A6E" }}
                                >
                                  {selectedBlog.title}
                                </Text>
                                <div
                                  style={{
                                    backgroundColor: "white",
                                    padding: "6px 12px",
                                    borderRadius: "20px",
                                    border: "1px solid #7DD3FC",
                                  }}
                                >
                                  <Text
                                    variant="bodySm"
                                    fontWeight="600"
                                    style={{ color: "#0C4A6E" }}
                                  >
                                    {selectedBlog.blogPosts?.length || 0}{" "}
                                    articles
                                  </Text>
                                </div>
                              </InlineStack>
                              <Text variant="bodySm" color="subdued">
                                Handle: {selectedBlog.handle} | Created:{" "}
                                {formatDate(selectedBlog.createdAt)}
                              </Text>
                            </BlockStack>
                          </div>
                        )}

                        {/* All Posts Header - only show for All view */}
                        {selectedBlogIndex === 0 && (
                          <div
                            style={{
                              background:
                                "linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)",
                              borderRadius: "16px",
                              padding: "24px",
                              border: "1px solid #7DD3FC",
                              boxShadow: "0 4px 12px rgba(2, 132, 199, 0.1)",
                            }}
                          >
                            <BlockStack gap="200">
                              <InlineStack align="space-between">
                                <InlineStack gap="300">
                                  <div
                                    style={{
                                      width: "40px",
                                      height: "40px",
                                      borderRadius: "12px",
                                      background:
                                        "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      boxShadow:
                                        "0 4px 12px rgba(139, 92, 246, 0.3)",
                                    }}
                                  >
                                    <Icon
                                      source={CollectionIcon}
                                      color="base"
                                    />
                                  </div>
                                  <Text
                                    variant="headingMd"
                                    fontWeight="bold"
                                    style={{ color: "#581C87" }}
                                  >
                                    All Blog Posts
                                  </Text>
                                </InlineStack>
                                <div
                                  style={{
                                    backgroundColor: "white",
                                    padding: "8px 16px",
                                    borderRadius: "20px",
                                    border: "1px solid #7DD3FC",
                                  }}
                                >
                                  <Text
                                    variant="bodySm"
                                    fontWeight="600"
                                    style={{ color: "#0C4A6E" }}
                                  >
                                    {sortedAllPosts.length} articles
                                  </Text>
                                </div>
                              </InlineStack>
                              <Text variant="bodySm" color="subdued">
                                Showing posts from all blogs, sorted by publish
                                date
                              </Text>
                            </BlockStack>
                          </div>
                        )}

                        {/* Articles List */}
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
                            <InlineStack gap="200" align="center">
                              <div
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "8px",
                                  background:
                                    "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Icon
                                  source={DataPresentationIcon}
                                  color="base"
                                />
                              </div>
                              <Text
                                variant="headingSm"
                                fontWeight="600"
                                style={{ color: "#065F46" }}
                              >
                                Articles
                              </Text>
                            </InlineStack>

                            {articles.length > 0 ? (
                              <ResourceList
                                items={articles}
                                renderItem={renderArticleItem}
                              />
                            ) : (
                              <div
                                style={{
                                  background:
                                    "linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%)",
                                  borderRadius: "16px",
                                  padding: "40px",
                                  textAlign: "center",
                                  border: "1px solid #E5E7EB",
                                }}
                              >
                                <EmptyState
                                  heading="No articles found"
                                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                >
                                  <p>
                                    No articles available in the selected blog.
                                  </p>
                                </EmptyState>
                              </div>
                            )}
                          </BlockStack>
                        </div>
                      </BlockStack>
                    ) : (
                      <div
                        style={{
                          background:
                            "linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%)",
                          borderRadius: "16px",
                          padding: "40px",
                          textAlign: "center",
                          border: "1px solid #E5E7EB",
                        }}
                      >
                        <EmptyState
                          heading="No blogs found"
                          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        >
                          <p>No blog data is available from the API.</p>
                        </EmptyState>
                      </div>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>
        {toastMarkup}
      </Page>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
        `}
      </style>
    </Frame>
  );
}
