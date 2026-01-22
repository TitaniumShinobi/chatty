import React from "react";
import { useNavigate } from "react-router-dom";
import Apps from "../components/Apps";

const AppsPage: React.FC = () => {
  const navigate = useNavigate();

  const handleClose = () => {
    navigate("/app");
  };

  const handleSelectApp = (appId: string) => {
    console.log(`Selected app: ${appId}`);
  };

  return (
    <Apps 
      onClose={handleClose} 
      onSelectApp={handleSelectApp}
    />
  );
};

export default AppsPage;
