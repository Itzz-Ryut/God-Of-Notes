const generateIdentityColor = () => {
  const value = Math.floor(Math.random() * 0xffffff);

  return `#${value.toString(16).padStart(6, "0")}`;
};

export default generateIdentityColor;