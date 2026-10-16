const notFound = (req, res) => {
  res.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "The requested route was not found",
    },
  });
};

export default notFound;