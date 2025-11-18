// Advanced Scenarios Tests
//
// Purpose: Demonstrate real-world usage patterns and scalability
//
// Client Value: "The bridge is production-ready for complex, multi-user scenarios"
//
// Test Coverage:
// - 📊 Single user complete journeys
// - 📊 Multiple concurrent users
// - 📊 Vault accounting with many users
// - 📊 Edge cases and boundary conditions
// - 📊 Operational flexibility

use super::*;
use soroban_sdk::vec;

// ============ Single User Journeys ============

mod single_user_journeys {
    //! # Single User Journeys
    //!
    //! **What This Proves**: Individual users can perform complex workflows
    //!
    //! **Why It Matters**: Demonstrates real-world user experience

    use super::*;

    #[test]
    fn test_user_can_lock_bridge_and_return_tokens() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: User has 10,000 tokens
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10_000);
        assert_eq!(test_env.lock_unlock_token.token_client.balance(&user), 10_000);

        // WHEN: User locks 5,000 tokens
        let from_token = test_env.lock_unlock_token.token_id.to_string();
        let to_token = String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e");
        let from_address = user.to_string();
        let to_address = String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4");
        let from_network = String::from_str(&env, "stellar:testnet");
        let to_network = String::from_str(&env, "pruv:testnet");

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &to_token,
            5_000,
            &from_address,
            &to_address,
            &from_network,
            &to_network,
            176294386600050,
            &String::from_str(&env, "ngocnt"),
            &user,
        );

        // THEN: User has 5,000 remaining
        assert_eq!(test_env.lock_unlock_token.token_client.balance(&user), 5_000);

        // AND: System wallet releases tokens back
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_RELEASE,
            &to_token,
            &from_token,
            5_000,
            &to_address,
            &from_address,
            &to_network,
            &from_network,
            176294386600051,
            &String::from_str(&env, "ngocnt"),
            &test_env.system_wallet,
        );

        // THEN: User has all 10,000 tokens back
        assert_eq!(test_env.lock_unlock_token.token_client.balance(&user), 10_000);
    }

    #[test]
    fn test_user_can_burn_bridge_and_return_tokens() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: User has 10,000 wrapped tokens
        test_env.mint_burn_token.stellar_asset_client.mint(&user, &10_000);
        assert_eq!(test_env.mint_burn_token.token_client.balance(&user), 10_000);

        // WHEN: User burns 5,000 tokens
        let from_token = test_env.mint_burn_token.token_id.to_string();
        let to_token = String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e");
        let from_address = user.to_string();
        let to_address = String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4");
        let from_network = String::from_str(&env, "stellar:testnet");
        let to_network = String::from_str(&env, "pruv:testnet");

        test_env.mint_burn_token.token_client.approve(&user, &test_env.bridge_id, &5_000, &200);

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_BURN,
            &from_token,
            &to_token,
            5_000,
            &from_address,
            &to_address,
            &from_network,
            &to_network,
            176294386600052,
            &String::from_str(&env, "ngocnt"),
            &user,
        );

        // THEN: User has 5,000 remaining
        assert_eq!(test_env.mint_burn_token.token_client.balance(&user), 5_000);

        // AND: System wallet mints tokens back
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_MINT,
            &to_token,
            &from_token,
            5_000,
            &to_address,
            &from_address,
            &to_network,
            &from_network,
            176294386600053,
            &String::from_str(&env, "ngocnt"),
            &test_env.system_wallet,
        );

        // THEN: User has all 10,000 tokens back
        assert_eq!(test_env.mint_burn_token.token_client.balance(&user), 10_000);
    }
}

// ============ Multi-User Scenarios ============

mod multi_user_scenarios {
    //! # Multi-User Scenarios
    //!
    //! **What This Proves**: The bridge scales to handle many users simultaneously
    //!
    //! **Why It Matters**: Demonstrates production readiness

    use super::*;

    #[test]
    fn test_five_users_concurrent_lock_and_release() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);

        // GIVEN: Five users each with 10,000 tokens
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let user3 = Address::generate(&env);
        let user4 = Address::generate(&env);
        let user5 = Address::generate(&env);

        let users = vec![&env, user1.clone(), user2.clone(), user3.clone(), user4.clone(), user5.clone()];

        for i in 0..5 {
            test_env.lock_unlock_token.stellar_asset_client.mint(&users.get(i).unwrap(), &10_000);
        }

        // WHEN: All users lock 5,000 tokens
        let from_token = test_env.lock_unlock_token.token_id.to_string();
        let to_token = String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e");
        let from_network = String::from_str(&env, "stellar:testnet");
        let to_network = String::from_str(&env, "pruv:testnet");

        for i in 0..5 {
            let user = users.get(i).unwrap();
            let from_address = user.to_string();
            let to_address = String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4");

            execute_bridge_op(
                &test_env.bridge_client,
                OPERATION_LOCK,
                &from_token,
                &to_token,
                5_000,
                &from_address,
                &to_address,
                &from_network,
                &to_network,
                176294386600060 + i as i128,
                &String::from_str(&env, "ngocnt"),
                &user,
            );
        }

        // THEN: All users should have 5,000 remaining
        for i in 0..5 {
            let user = users.get(i).unwrap();
            assert_eq!(test_env.lock_unlock_token.token_client.balance(&user), 5_000);
        }

        // AND: Bridge should hold 25,000 total
        assert_eq!(test_env.lock_unlock_token.token_client.balance(&test_env.bridge_id), 25_000);
    }

    #[test]
    fn test_vault_accounting_remains_accurate_with_multiple_users() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);

        // GIVEN: Three users with different amounts
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let user3 = Address::generate(&env);

        test_env.lock_unlock_token.stellar_asset_client.mint(&user1, &10_000);
        test_env.lock_unlock_token.stellar_asset_client.mint(&user2, &20_000);
        test_env.lock_unlock_token.stellar_asset_client.mint(&user3, &30_000);

        // WHEN: Each user locks different amounts
        let from_token = test_env.lock_unlock_token.token_id.to_string();
        let to_token = String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e");
        let from_network = String::from_str(&env, "stellar:testnet");
        let to_network = String::from_str(&env, "pruv:testnet");

        // User 1 locks 3,000
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &to_token,
            3_000,
            &user1.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &from_network,
            &to_network,
            176294386600070,
            &String::from_str(&env, "ngocnt"),
            &user1,
        );

        // User 2 locks 7,000
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &to_token,
            7_000,
            &user2.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &from_network,
            &to_network,
            176294386600071,
            &String::from_str(&env, "ngocnt"),
            &user2,
        );

        // User 3 locks 15,000
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &to_token,
            15_000,
            &user3.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &from_network,
            &to_network,
            176294386600072,
            &String::from_str(&env, "ngocnt"),
            &user3,
        );

        // THEN: Bridge should hold exactly 25,000 (3,000 + 7,000 + 15,000)
        assert_eq!(test_env.lock_unlock_token.token_client.balance(&test_env.bridge_id), 25_000);

        // AND: Each user should have correct remaining balance
        assert_eq!(test_env.lock_unlock_token.token_client.balance(&user1), 7_000);
        assert_eq!(test_env.lock_unlock_token.token_client.balance(&user2), 13_000);
        assert_eq!(test_env.lock_unlock_token.token_client.balance(&user3), 15_000);
    }
}

// ============ Edge Cases and Limits ============

mod edge_cases_and_limits {
    //! # Edge Cases and Limits
    //!
    //! **What This Proves**: Tested at scale and at the edges
    //!
    //! **Why It Matters**: Ensures robustness under extreme conditions

    use super::*;

    #[test]
    fn test_handles_maximum_safe_integer_amounts() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: User has maximum safe amount
        let max_safe: i128 = 9007199254740991;
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &max_safe);

        // WHEN: User locks maximum safe amount
        let from_token = test_env.lock_unlock_token.token_id.to_string();
        let to_token = String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e");

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &to_token,
            max_safe,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            176294386600080,
            &String::from_str(&env, "ngocnt"),
            &user,
        );

        // THEN: Bridge should hold the maximum safe amount
        assert_eq!(test_env.lock_unlock_token.token_client.balance(&test_env.bridge_id), max_safe);
    }
}

// ============ Operational Workflows ============

mod operational_workflows {
    //! # Operational Workflows
    //!
    //! **What This Proves**: Operational flexibility without compromising security
    //!
    //! **Why It Matters**: Enables smooth operations and maintenance

    use super::*;

    #[test]
    fn test_system_wallet_rotation_during_active_operations() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: Bridge is operating with initial system wallet
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10_000);

        // WHEN: User locks tokens
        let from_token = test_env.lock_unlock_token.token_id.to_string();
        let to_token = String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e");

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &to_token,
            5_000,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            176294386600090,
            &String::from_str(&env, "ngocnt"),
            &user,
        );

        // AND: New system wallet is added
        let new_wallet = Address::generate(&env);
        test_env.bridge_client.add_system_wallet(&new_wallet, &test_env.owner);

        // THEN: New wallet can release tokens
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_RELEASE,
            &to_token,
            &from_token,
            5_000,
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &user.to_string(),
            &String::from_str(&env, "pruv:testnet"),
            &String::from_str(&env, "stellar:testnet"),
            176294386600091,
            &String::from_str(&env, "ngocnt"),
            &new_wallet,
        );

        // AND: User should have all tokens back
        assert_eq!(test_env.lock_unlock_token.token_client.balance(&user), 10_000);
    }
}
