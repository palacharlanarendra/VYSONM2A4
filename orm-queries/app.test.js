const request = require("supertest");
const app = require("./index.js");
const { sequelize, User, UrlShortner } = require("./db.js");
const redis = require("./redis.js");

describe("API Integration Tests v2", () => {
  let user;

  const TEST_IP = "127.0.0.1";
  const MAX_REQUESTS = 10;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    // create a dummy user with api_key
    user = await User.create({
      email: "testuser@gmail.com",
      name: "testuser",
      api_key: "abc123xyz",
      tier: "enterprise",
    });

    await redis.del(`rate_limit:${TEST_IP}`);
  });

  it("should shorten a URL and redirect", async () => {
    const response = await request(app)
      .post("/v2/shorten")
      .set("Content-Type", "application/json")
      .set("x-api-key", "abc123xyz")
      .send({ url: "https://example.com/" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("short_code");
    expect(response.body.short_code.length).toBe(6);
    const shortCode = response.body.short_code;

    const redirectResponse = await request(app)
      .get("/v2/redirect")
      .set("x-api-key", "abc123xyz")
      .query({ code: shortCode });
    expect(redirectResponse.statusCode).toBe(200);
    expect(redirectResponse.body).toHaveProperty("url", "https://example.com/");
  });

  it("should shorten a URL and redirect with correct password", async () => {
    const response = await request(app)
      .post("/v2/shorten")
      .set("x-api-key", "abc123xyz")
      .send({ url: "https://example.com/", password: "secret123" });

    const shortCode = response.body.short_code;
    await request(app)
      .get("/v2/redirect")
      .set("x-api-key", "abc123xyz")
      .query({ code: shortCode, password: "secret123" });

    const redirectResponse = await request(app)
      .get("/v2/redirect")
      .set("x-api-key", "abc123xyz")
      .query({ code: shortCode, password: "secret123" });

    expect(redirectResponse.statusCode).toBe(200);
    expect(redirectResponse.body).toHaveProperty("url", "https://example.com/");
  });

  it("should fail redirect with wrong password", async () => {
    const response = await request(app)
      .post("/v2/shorten")
      .set("x-api-key", "abc123xyz")
      .send({ url: "https://example.com/", password: "secret123" });

    const shortCode = response.body.short_code;

    const redirectResponse = await request(app)
      .get("/v2/redirect")
      .set("x-api-key", "abc123xyz")
      .query({ code: shortCode, password: "wrongpass" });

    expect(redirectResponse.statusCode).toBe(401);
    expect(redirectResponse.body).toHaveProperty(
      "error",
      "Password required or invalid"
    );
  });

  it("empty URL", async () => {
    const response = await request(app)
      .post("/v2/shorten")
      .set("Content-Type", "application/json")
      .set("x-api-key", "abc123xyz")
      .send({ url: "" });
    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("error", "Input URI cannot be empty!");
  });

  it("Short code not existed", async () => {
    const redirectResponse = await request(app)
      .get("/v2/redirect")
      .set("x-api-key", "abc123xyz")
      .query({ code: "YYYYYY" });
    expect(redirectResponse.statusCode).toBe(404);
    expect(redirectResponse.body).toHaveProperty(
      "error",
      "Short code not found"
    );
  });

  it("Short code is required", async () => {
    const redirectResponse = await request(app)
      .get("/v2/redirect")
      .set("x-api-key", "abc123xyz")
      .query({ code: "" });
    expect(redirectResponse.statusCode).toBe(400);
    expect(redirectResponse.body).toHaveProperty(
      "error",
      "Short code is required!"
    );
  });

  it("should return 404 for unknown endpoint", async () => {
    const response = await request(app).get("/v2/test404").set("x-api-key", "abc123xyz");
    expect(response.statusCode).toBe(404);
  });

  it("should return error if short code is expired", async () => {
    const shortnedURL = await request(app)
      .post("/v2/shorten")
      .set("Content-Type", "application/json")
      .set("x-api-key", "abc123xyz")
      .send({
        url: "https://example.com",
        expiry_date: "2025-07-30T12:54:11.847Z",
      });

    const response = await request(app)
      .get("/v2/redirect")
      .set("x-api-key", "abc123xyz")
      .query({ code: shortnedURL.body.short_code });

    expect(response.statusCode).toBe(410);
    expect(response.body).toHaveProperty("error", "Short code is expired!");
  });

  it("should shorten for custom code", async () => {
    const custom_code = "examplecomcode";
    await request(app)
      .post("/v2/shorten")
      .set("Content-Type", "application/json")
      .set("x-api-key", "abc123xyz")
      .send({ url: "https://example.com", custom_code });

    const response = await request(app)
      .get("/v2/redirect")
      .set("x-api-key", "abc123xyz")
      .query({ code: custom_code });

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("url", "https://example.com");
  });

  it("delete shorten URL", async () => {
    const response = await request(app)
      .post("/v2/shorten")
      .set("Content-Type", "application/json")
      .set("x-api-key", "abc123xyz")
      .send({ url: "https://example.com/" });

    const shortCode = response.body.short_code;

    const redirectResponse = await request(app)
      .get("/v2/redirect")
      .set("x-api-key", "abc123xyz")
      .query({ code: shortCode });
    expect(redirectResponse.statusCode).toBe(200);

    const deleteResponse = await request(app)
      .delete(`/v2/shorten/${shortCode}`)
      .set("x-api-key", "abc123xyz");
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.body).toHaveProperty(
      "message",
      "Short code deleted successfully"
    );
  });

  it("should shorten multiple URLs and return status per item", async () => {
    const payload = {
      original_data: [
        { url: "https://www.example.com", custom_code: "example" },
        { url: "https://www.google.com" },
        { url: "https://www.github.com", custom_code: "git123" },
      ],
    };

    const res = await request(app)
      .post("/v2/shorten/bulk")
      .set("Content-Type", "application/json")
      .set("x-api-key", "abc123xyz")
      .send(payload);

    expect(res.status).toBe(207);
    expect(res.body).toHaveProperty("results");
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results[0]).toHaveProperty("url");
    expect(res.body.results[0]).toHaveProperty("short_code");
  });

  it("should update expiry date successfully", async () => {
    const shortUrl = await UrlShortner.create({
      original_url: "https://example.com",
      short_code: "abc123",
      user_id: user.id,
      expiry_date: new Date("2027-01-01"),
    });

    const response = await request(app)
      .post(`/v2/updateExpiryDate/${shortUrl.short_code}`)
      .set("x-api-key", "abc123xyz")
      .send({ expiry_date: "2026-06-30T12:54:11.847Z" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty(
      "message",
      "Expiry date updated successfully"
    );
    expect(response.body.short_code).toBe("abc123");
    expect(response.body.expiry_date).toBe("2026-06-30T12:54:11.847Z");
  });

  it("should return all shortened URLs for the user", async () => {
    const res = await request(app)
      .get("/v2/shortenedUrls")
      .set("x-api-key", "abc123xyz");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("urls");
    expect(Array.isArray(res.body.urls)).toBe(true);
  });

  it("should allow requests under the limit", async () => {
    for (let i = 1; i <= MAX_REQUESTS + 1; i++) {
      const res = await request(app)
        .get("/v1/health")
        .set("X-Forwarded-For", TEST_IP)
        .set("x-api-key", "abc123xyz");
      if (i === MAX_REQUESTS + 1) {
        expect(res.statusCode).toBe(429);
      } else {
        expect(res.statusCode).toBe(200);
      }
    }
  });
});

describe("API Integration Tests v1 (Backward Compatibility)", () => {
  let user;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    // create a dummy user without requiring api_key for v1
    user = await User.create({
      email: "v1user@gmail.com",
      name: "v1user",
      api_key: "v1apikey",
      tier: "enterprise",
    });
  });

  it("should shorten a URL without API key", async () => {
    const response = await request(app)
      .post("/v1/shorten")
      .send({ url: "https://example.com/" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("short_code");
  });

  it("should redirect shortened URL without API key", async () => {
    const shortenResponse = await request(app)
      .post("/v1/shorten")
      .send({ url: "https://example.com/v1" });

    const shortCode = shortenResponse.body.short_code;

    const redirectResponse = await request(app)
      .get("/v1/redirect")
      .query({ code: shortCode });

    expect(redirectResponse.statusCode).toBe(200);
    expect(redirectResponse.body).toHaveProperty(
      "url",
      "https://example.com/v1"
    );
  });

  it("should return 400 for empty URL", async () => {
    const response = await request(app).post("/v1/shorten").send({ url: "" });

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("error", "Input URI cannot be empty!");
  });

  it("should handle custom code", async () => {
    const response = await request(app)
      .post("/v1/shorten")
      .send({ url: "https://example.com/v1custom", custom_code: "v1custom" });

    expect(response.statusCode).toBe(200);
    expect(response.body.short_code).toBe("v1custom");
  });

  it("should return 404 for unknown endpoint", async () => {
    const response = await request(app).get("/v1/test404");
    expect(response.statusCode).toBe(404);
  });
});

afterAll(async () => {
  await sequelize.close();
  if (app && app.close) app.close();
});
