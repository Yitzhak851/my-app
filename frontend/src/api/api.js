// my-YBO-app/src/api/api.js

const BASE_URL = "http://localhost:5000/api";

// Fetch posts with optional pagination and filters
export async function fetchPosts(
  start = 0,
  limit = 10,
  userId = null,
  followingOnly = false,
  currentUserId = null
) {
  let url = `${BASE_URL}/posts?start=${start}&limit=${limit}`;

  if (userId) {
    url += `&userId=${userId}`;
  }

  if (followingOnly && currentUserId) {
    url += `&followingOnly=true&currentUserId=${currentUserId}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch posts");
  }

  return response.json();
}

// Fetch users with optional pagination and search
export async function fetchUsers(start = 0, limit = 10, search = "") {
  const response = await fetch(
    `${BASE_URL}/users?start=${start}&limit=${limit}&search=${search}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch users");
  }

  return response.json();
}

export async function login(email, password) {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Login failed");
  }

  return response.json();
}


export async function createPost(postData) {
  const response = await fetch(`${BASE_URL}/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(postData),
  });

  if (!response.ok) {
    throw new Error("Failed to create post");
  }

  return response.json();
}

export async function followUser(followerId, followingId) {
  const response = await fetch(`${BASE_URL}/follows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      follower_id: followerId,
      following_id: followingId,
    }),
  });

  return response.json();
}

export async function unfollowUser(followerId, followingId) {
  const response = await fetch(`${BASE_URL}/follows`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      follower_id: followerId,
      following_id: followingId,
    }),
  });

  return response.json();
}

export async function checkIfFollowing(followerId, followingId) {
  const response = await fetch(
    `${BASE_URL}/follows/check?follower_id=${followerId}&following_id=${followingId}`
  );

  return response.json();
}

export async function fetchFollowStats(userId) {
  const response = await fetch(`${BASE_URL}/users/${userId}/follow-stats`);

  if (!response.ok) {
    throw new Error("Failed to fetch follow stats");
  }

  return response.json();
}