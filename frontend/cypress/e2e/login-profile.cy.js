describe('Login and Profile E2E Test', () => {
  const baseUrl = 'http://localhost:5173';
  const apiUrl = 'http://localhost:5000/api';

  const testUser = {
    email: 'test@example.com',
    password: 'password123',
    name: 'Test User',
    id: 1,
    bio: 'Test bio',
    profile_picture: 'https://api.dicebear.com/9.x/adventurer/svg?seed=test',
  };

  beforeEach(() => {
    // Mock the API responses
    cy.intercept('POST', `${apiUrl}/auth/login`, {
      statusCode: 200,
      body: {
        message: 'Login successful',
        user: {
          id: testUser.id,
          email: testUser.email,
          name: testUser.name,
          bio: testUser.bio,
          profile_picture: testUser.profile_picture,
        },
      },
    }).as('loginRequest');

    cy.intercept('GET', `${apiUrl}/users/${testUser.id}`, {
      statusCode: 200,
      body: {
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        bio: testUser.bio,
        profile_picture: testUser.profile_picture,
        created_at: '2024-01-01T00:00:00',
      },
    }).as('getUserRequest');

    cy.intercept('GET', `${apiUrl}/users/${testUser.id}/follow-stats`, {
      statusCode: 200,
      body: {
        followers: 10,
        following: 5,
        posts: 3,
      },
    }).as('getFollowStatsRequest');

    cy.intercept('GET', `${apiUrl}/posts**`, {
      statusCode: 200,
      body: [
        {
          id: 1,
          user_id: testUser.id,
          title: 'Test Post',
          body: 'This is a test post',
          created_at: '2024-01-01T00:00:00',
          name: testUser.name,
          email: testUser.email,
          profile_picture: testUser.profile_picture,
        },
      ],
    }).as('getPostsRequest');

    // Clear localStorage
    cy.clearLocalStorage();
  });

  it('should load the application', () => {
    cy.visit(baseUrl);
    cy.contains(/home|welcome|feed/i).should('be.visible');
  });

  it('should navigate to login page', () => {
    cy.visit(baseUrl);
    cy.contains(/login|sign in|התחבר/i).click();
    cy.url().should('include', 'login');
  });

  it('should login user successfully', () => {
    cy.visit(`${baseUrl}/login`);

    // Fill email
    cy.get('input[type="email"], input[placeholder*="email" i]').type(testUser.email);

    // Fill password
    cy.get('input[type="password"], input[placeholder*="password" i]').type(
      testUser.password
    );

    // Submit login form
    cy.contains(/sign in|login|התחבר/i).click();

    // Wait for API call
    cy.wait('@loginRequest');

    // Should be logged in (redirect to home or feed)
    cy.url().should('not.include', 'login');
  });

  it('should display logged in status after login', () => {
    cy.visit(`${baseUrl}/login`);

    cy.get('input[type="email"], input[placeholder*="email" i]').type(testUser.email);
    cy.get('input[type="password"], input[placeholder*="password" i]').type(
      testUser.password
    );

    cy.contains(/sign in|login|התחبר/i).click();
    cy.wait('@loginRequest');

    // User should be navigated away from login
    cy.url().should('not.include', 'login');
  });

  it('should navigate to user profile after login', () => {
    cy.visit(`${baseUrl}/login`);

    cy.get('input[type="email"], input[placeholder*="email" i]').type(testUser.email);
    cy.get('input[type="password"], input[placeholder*="password" i]').type(
      testUser.password
    );

    cy.contains(/sign in|login|התחברות/i).click();
    cy.wait('@loginRequest');

    // Navigate to profile
    cy.contains(/profile|my profile|my-profile|פרופיל/i).click();

    // Wait for profile data
    cy.wait('@getUserRequest');
  });

  it('should display user profile information', () => {
    // Setup: Manually set user in localStorage to simulate login
    cy.window().then((win) => {
      win.localStorage.setItem(
        'currentUser',
        JSON.stringify({
          id: testUser.id,
          email: testUser.email,
          name: testUser.name,
          bio: testUser.bio,
          profile_picture: testUser.profile_picture,
        })
      );
    });

    cy.visit(`${baseUrl}`);

    // Navigate to profile
    cy.contains(/profile|my profile|פרופיל/i).click();

    // Wait for API calls
    cy.wait('@getUserRequest');
    cy.wait('@getFollowStatsRequest');

    // Check if profile information is displayed
    cy.contains(testUser.name).should('exist');
    cy.contains(testUser.email).should('exist');
  });

  it('should display followers and following stats', () => {
    cy.window().then((win) => {
      win.localStorage.setItem(
        'currentUser',
        JSON.stringify({
          id: testUser.id,
          email: testUser.email,
          name: testUser.name,
        })
      );
    });

    cy.visit(`${baseUrl}`);
    cy.contains(/profile|my profile|פרופיל/i).click();

    cy.wait('@getFollowStatsRequest');

    // Check if follow stats are displayed
    cy.contains(/followers|10/i).should('exist');
    cy.contains(/following|5/i).should('exist');
  });

  it('should display user posts', () => {
    cy.window().then((win) => {
      win.localStorage.setItem(
        'currentUser',
        JSON.stringify({
          id: testUser.id,
          email: testUser.email,
          name: testUser.name,
        })
      );
    });

    cy.visit(`${baseUrl}`);
    cy.contains(/profile|my profile|פרופיל/i).click();

    cy.wait('@getPostsRequest');

    // Check if posts are displayed
    cy.contains('Test Post').should('exist');
  });
});
