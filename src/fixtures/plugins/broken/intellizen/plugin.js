export default {
  name: "Wave 1 broken proof",
  register() {
    throw new Error("D.13 deliberate isolated failure");
  },
};
