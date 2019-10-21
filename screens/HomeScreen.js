import React from "react";
import { Alert, View } from "react-native";
import { MapView } from "expo";

import { ButtonGroup } from "react-native-elements";

import demonHusky from "../assets/images/husky.png";

import { cluesRef, huntersRef } from "../fire";
import Clue from "../components/Clue";
import AuthScreen from "./AuthScreen";

import UserHeader from "../components/UserHeader";

import GDrive from "react-native-google-drive-api-wrapper";

// Controls initial zoom of the map
const LATITUDE_DELTA = 0.06;
const LONGITUDE_DELTA = 0.06;

export default class HomeScreen extends React.Component {
  static navigationOptions = {
    header: null // Removes the navigation header
  };

  constructor(props) {
    super(props);

    this.state = {
      userGivenName: null, // Firstname from google auth
      accessToken: null, // Google Token
      refreshToken: null, // refresh Token
      accessTokenExpirationDate: null,
      isLoading: true,
      clues: [],
      hunters: [],
      region: null,
      clueVisibilitySelectedIndex: 0,
      myName: null
    };
  }

  _logout = () => {
    this.setState({ userGivenName: null });
    this.setState({ accessToken: null });
    this.setState({ refreshToken: null });
    this.setState({ accessTokenExpirationDate: null });
  };

  // AuthScreen calls this on login, rehydrate, or refresh
  _setUser = (
    userGivenName,
    accessToken,
    refreshToken,
    accessTokenExpirationDate
  ) => {
    this.setState({ userGivenName });
    this.setState({ accessToken });
    this.setState({ refreshToken });
    this.setState({ accessTokenExpirationDate });

    GDrive.setAccessToken(accessToken);
    GDrive.init();
  };

  _tokenAboutToExpire() {
    const { accessTokenExpirationDate, refreshToken } = this.state;

    // If we don't have an expirationTime or a way to refresh it yet, break out and return FALSE
    if (!accessTokenExpirationDate || !refreshToken) {
      return false;
    }

    const expiryTime = new Date(accessTokenExpirationDate);
    const thresholdTime = new Date();
    thresholdTime.setMinutes(thresholdTime.getMinutes() - 10);

    console.log("expiryTime", expiryTime);
    console.log("thresholdTime", thresholdTime);

    if (expiryTime.valueOf() < thresholdTime.valueOf()) {
      console.log("token expiring");
      return true;
    } else {
      console.log("token good to go!");
      return false;
    }
  }

  render() {
    const {
      userGivenName,
      accessToken,
      accessTokenExpirationDate
    } = this.state;

    const isTokenAboutToExpire = this._tokenAboutToExpire();

    // Auth
    if (!userGivenName || !accessToken || isTokenAboutToExpire) {
      return (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <AuthScreen
            doRefresh={isTokenAboutToExpire}
            setUser={this._setUser}
          />
        </View>
      );
    }

    // Main App
    return (
      <View style={{ flex: 1 }}>
        <MapView
          style={{ flex: 1 }}
          initialRegion={this.state.region}
          showsUserLocation={true}
          showsMyLocationButton={true}
        >
          {this.renderClues()}
          {this.renderHunters()}
        </MapView>
        <ButtonGroup
          onPress={index =>
            this.setState({ clueVisibilitySelectedIndex: index })
          }
          selectedIndex={this.state.clueVisibilitySelectedIndex}
          buttons={["All", "Completed", "Uncompleted"]}
        />
        {/* Absolute components */}
        <View style={styles.headerStyle}>
          <UserHeader
            triggerLogout={this._logout}
            userGivenName={userGivenName}
            accessTokenExpirationDate={accessTokenExpirationDate}
          />
        </View>
      </View>
    );
  }

  componentDidMount() {
    this.fetchClueData();
    this.fetchHunterData();
    this.setRegion();
    this.setupLocationPosting();
  }

  fetchClueData() {
    cluesRef.on("value", snapshot => {
      let clues = [];
      snapshot.forEach(item => {
        clues.push({ ...item.val(), key: item.key });
      });

      this.setState({ clues });
    });
  }

  fetchHunterData() {
    huntersRef.on("value", snapshot => {
      let hunters = [];
      snapshot.forEach(item => {
        hunters.push({ ...item.val(), name: item.key });
      });

      this.setState({ hunters });
    });
  }

  setRegion() {
    this.getCurrentLocation().then(position => {
      if (position) {
        this.setState({
          region: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            latitudeDelta: LATITUDE_DELTA,
            longitudeDelta: LONGITUDE_DELTA
          }
        });
      }
    });
  }

  getCurrentLocation() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    });
  }

  setupLocationPosting() {
    this.uploadLocation(); //Post location on application start as well
    navigator.geolocation.watchPosition(this.uploadLocation);
  }

  uploadLocation = async () => {
    let username = this.state.userGivenName;
    if (username) {
      const currentLocation = await this.getCurrentLocation();
      const hunterInfo = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude
      };

      huntersRef.child(username).update(hunterInfo);
    }
  };

  renderClues() {
    const allClues = this.state.clues;
    const clueVisibilitySelectedIndex = this.state.clueVisibilitySelectedIndex;
    let cluesToShow = [];

    switch (clueVisibilitySelectedIndex) {
      case 0: // All
        cluesToShow = allClues;
        break;
      case 1: // Completed
        cluesToShow = allClues.filter(clue => clue.completed);
        break;
      case 2: // Uncompleted
        cluesToShow = allClues.filter(clue => !clue.completed);
        break;
      default:
        console.error(
          `Expected a valid clue visibility, got ${clueVisibilitySelectedIndex}`
        );
    }

    return cluesToShow.map((clue, index) => {
      return (
        <Clue
          clue={clue}
          key={index}
          onCluePress={this.makeOnCluePress(clue)}
        />
      );
    });
  }

  // Closes over the clue so the clue's press callback will have access to it
  makeOnCluePress = clue => {
    return () => {
      Alert.alert(
        "Change completion",
        "Change this clue's completion?",
        [
          { text: "Take Photo", onPress: () => this.pushCamera(clue) },
          {
            text: clue.completed ? "Mark Incomplete" : "Mark Complete",
            onPress: () => HomeScreen.toggleComplete(clue)
          },
          {
            text: "Cancel",
            onPress: () => console.log("canceled"),
            style: "cancel"
          }
        ],
        { cancelable: true }
      );
    };
  };

  pushCamera = clue => {
    this.props.navigation.push("Camera", { clue: clue });
  };

  static async toggleComplete(clue) {
    return cluesRef.child(clue.key).update({ completed: !clue.completed });
  }

  renderHunters() {
    return this.state.hunters.map(hunter => {
      const coords = { latitude: hunter.latitude, longitude: hunter.longitude };
      return (
        <MapView.Marker
          key={hunter.name}
          coordinate={coords}
          title={hunter.name}
          image={demonHusky}
        />
      );
    });
  }
}

const styles = {
  headerStyle: { position: "absolute", top: 50, left: 20 }
};
