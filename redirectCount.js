// redirectCount.js
(async () => {
  const fetch = (await import("node-fetch")).default;

  const start = Date.now();

  fetch("http://127.0.0.1:3000/v1/shorten", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "api_key": "abc123xyz"
  },
  body: JSON.stringify({
    url: "http://www.example.com",
    expiry_date: "2026-08-30T12:54:11.847Z",
    custom_code: "examplecomcode2",
    password: "password1234"
  })
})
  .then(response => response.json())
  .then(data => console.log("Response:", data))
  .catch(error => console.error("Error:", error));

  const requests = Array.from({ length: 100 }, () =>
    fetch("http://127.0.0.1:3000/v2/redirect?code=examplecomcode2&password=password1234")
  );

  const responses = await Promise.allSettled(requests);

  const successful = responses.filter(
    (r) => r.status === "fulfilled" && r.value.ok
  ).length;
  const failed = responses.length - successful;

  const end = Date.now();

  console.log(`✅ Successful: ${successful}, ❌ Failed: ${failed}`);
  console.log(`⏱ Total time: ${end - start} ms`);
})();
