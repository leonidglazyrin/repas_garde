import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Accompaniments from "./Accompaniments.jsx";
import "./autosaveRealtime.js";
import "./libraryDisclosure.js";
import "./groceryGrouping.js";
import "./groceryCategories.js";
import "./mealIngredientDisclosure.js";
import "./todayFocus.js";
import "./desserts.js";
import "./mobileKeyboardStability.js";
import "./libraryPickerVisibility.js";
import "./mobileOptimizations.css";

const DiscoverDishes = React.lazy(() => import("./DiscoverDishes.jsx"));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("UI error", error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <>
    <ErrorBoundary fallback={<div style={{ padding: 24, fontFamily: "system-ui" }}>L'application n'a pas pu s'afficher. Recharge la page.</div>}>
      <App />
    </ErrorBoundary>
    <ErrorBoundary fallback={null}>
      <Accompaniments />
    </ErrorBoundary>
    <ErrorBoundary fallback={null}>
      <React.Suspense fallback={null}>
        <DiscoverDishes />
      </React.Suspense>
    </ErrorBoundary>
  </>
);
