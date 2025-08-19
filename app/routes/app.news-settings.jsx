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
      const response = await fetch(`/api/news.hot`, {
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
        <BlockStack gap="200">
          <InlineStack align="space-between">
            <InlineStack gap="200">
              {isHot && <Icon source={StarFilledIcon} color="warning" />}
              <Text variant="bodyMd" fontWeight="bold">
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
              />
            </InlineStack>
          </InlineStack>
          <InlineStack align="start" gap="200" wrap>
            <Text variant="bodySm" color="subdued">
              Published: {formatDate(article.publishedAt)}
            </Text>
            {article.author && (
              <Text variant="bodySm" color="subdued">
                Author: {article.author}
              </Text>
            )}
            {/* Show blog tag in "All" view */}
            {selectedBlogIndex === 0 && article.blogTitle && (
              <Tag>Blog: {article.blogTitle}</Tag>
            )}
            {isHot && <Badge status="warning">Hot</Badge>}
          </InlineStack>

          <Collapsible open={isExpanded} id={`article-${article.id}`}>
            <Box
              padding="300"
              background="bg-surface-subdued"
              borderRadius="200"
            >
              <BlockStack gap="300">
                <Text variant="headingSm">Article Content</Text>
                <div
                  style={{
                    maxHeight: "500px",
                    overflow: "auto",
                    padding: "16px",
                    backgroundColor: "white",
                    borderRadius: "8px",
                    border: "1px solid #e1e3e5",
                  }}
                >
                  {article.content ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: article.content,
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
      </ResourceItem>
    );
  };

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
                  <InlineStack gap="200">
                    <Badge
                      status={hotArticlesCount >= 2 ? "warning" : "success"}
                    >
                      {hotArticlesCount}/2 Hot Posts
                    </Badge>
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
                      {/* Blog Tabs with All option */}
                      <LegacyTabs
                        tabs={tabItems}
                        selected={selectedBlogIndex}
                        onSelect={(selectedTabIndex) =>
                          setSelectedBlogIndex(selectedTabIndex)
                        }
                      />

                      {/* Selected Blog Info - only show for specific blogs */}
                      {selectedBlogIndex !== 0 && selectedBlog && (
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
                              <Badge>
                                {selectedBlog.blogPosts?.length || 0} articles
                              </Badge>
                            </InlineStack>
                            <Text variant="bodySm" color="subdued">
                              Handle: {selectedBlog.handle} | Created:{" "}
                              {formatDate(selectedBlog.createdAt)}
                            </Text>
                          </BlockStack>
                        </Box>
                      )}

                      {/* All Posts Header - only show for All view */}
                      {selectedBlogIndex === 0 && (
                        <Box
                          padding="400"
                          background="bg-surface-secondary"
                          borderRadius="200"
                        >
                          <BlockStack gap="200">
                            <InlineStack align="space-between">
                              <InlineStack gap="200">
                                <Icon source={CollectionIcon} color="base" />
                                <Text variant="headingMd" fontWeight="bold">
                                  All Blog Posts
                                </Text>
                              </InlineStack>
                              <Badge>{sortedAllPosts.length} articles</Badge>
                            </InlineStack>
                            <Text variant="bodySm" color="subdued">
                              Showing posts from all blogs, sorted by publish
                              date
                            </Text>
                          </BlockStack>
                        </Box>
                      )}

                      {/* Articles List */}
                      <Text variant="headingSm">Articles</Text>
                      {articles.length > 0 ? (
                        <ResourceList
                          items={articles}
                          renderItem={renderArticleItem}
                        />
                      ) : (
                        <EmptyState
                          heading="No articles found"
                          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        >
                          <p>No articles available in the selected blog.</p>
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
          </Layout.Section>
        </Layout>
      </BlockStack>

      {toastActive && (
        <Toast
          content={toastMessage}
          error={toastError}
          onDismiss={() => setToastActive(false)}
          duration={3000}
        />
      )}
    </Page>
  );
}
