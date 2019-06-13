import React from "react";
import App, { Container } from "next/app";
import { Provider as ReduxProvider } from "react-redux";
import serialize from "../common/src/serialize";
import deserialize from "../common/src/deserialize";
import getDiContainer from "../src/app/lib/getDiContainer";
import getReduxStore from "../src/app/lib/getReduxStore";
import getRelayEnvironment from "../src/app/lib/getRelayEnvironment";
import { appOperations, appSelectors } from "../src/app/state";
import { fetchQuery, RelayProvider } from "../src/app/providers/Relay";
import StylesProvider from "../src/app/providers/StylesContainer";
import IntlProvider from "../src/app/providers/IntlContainer";
import DateProvider from "../src/app/providers/DateContainer";

class MyApp extends App {
  static async getInitialProps({ Component, ctx }) {
    const { req, res, err, query } = ctx;

    let statusCode = (err && err.statusCode) || (res && res.statusCode) || 200;
    if (statusCode === 200 && err) statusCode = 500;

    // Dependency Injection Container
    // Available in Thunk as the third argument, i.e.:
    // (dispatch, getState, di) => Promise
    const di = getDiContainer();

    // Redux Store
    const store = getReduxStore(di);
    await store.dispatch(
      appOperations.create({
        statusCode,
        isStaticSite: !!(query && query.isStaticSite),
        locale: query && query.locale,
        theme: query && query.theme,
        appServer: query && query.appServer,
        apiServer: query && query.apiServer,
        wsServer: query && query.wsServer,
        googleMapsKey: query && query.googleMapsKey
      })
    );

    // Relay Environment
    const environment = getRelayEnvironment(di);

    if (req) {
      // Let Fetcher know we are doing SSR right now
      di.get("fetcher").setReqRes(req, res);
    }

    ctx.di = di;
    ctx.store = store;
    ctx.fetchQuery = fetchQuery(environment);
    ctx.theme = appSelectors.getTheme(store.getState());

    let pageProps = {};
    if (Component.getInitialProps) {
      try {
        pageProps = await Component.getInitialProps(ctx);
      } catch (error) {
        console.error(error);
        if (statusCode === 200)
          await store.dispatch(appOperations.setStatusCode({ code: 500 }));
      }
    }

    statusCode = appSelectors.getStatusCode(store.getState());
    if (statusCode !== 200 && res && res.statusCode !== statusCode)
      res.status(statusCode);

    return {
      pageProps,
      reduxState: serialize(store.getState(), "redux"),
      relayState: serialize(environment.getStore().getSource(), "relay")
    };
  }

  constructor(props) {
    super(props);

    this.di = getDiContainer();
    this.reduxStore = getReduxStore(
      this.di,
      deserialize(props.reduxState, "redux")
    );
    this.relayEnvironment = getRelayEnvironment(
      this.di,
      deserialize(props.relayState, "relay")
    );
  }

  componentDidMount() {
    // Start the app
    this.reduxStore.dispatch(appOperations.start()).catch(console.error);

    // Remove the server-side injected CSS.
    const jssStyles = document.querySelector("#jss-server-side");
    if (jssStyles) {
      jssStyles.parentNode.removeChild(jssStyles);
    }
  }

  render() {
    const { Component, pageProps } = this.props;

    return (
      <Container>
        <ReduxProvider store={this.reduxStore}>
          <RelayProvider environment={this.relayEnvironment}>
            <StylesProvider>
              <IntlProvider>
                <DateProvider>
                  <Component {...pageProps} />
                </DateProvider>
              </IntlProvider>
            </StylesProvider>
          </RelayProvider>
        </ReduxProvider>
      </Container>
    );
  }
}

export default MyApp;
